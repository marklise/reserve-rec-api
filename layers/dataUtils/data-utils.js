const { marshall } = require("/opt/dynamodb");
const { Exception, getNowISO, logger } = require("/opt/base");
const { DEFAULT_API_UPDATE_CONFIG } = require("/opt/data-constants");

/**
 * Handles quick API updates for a given table. See README for more information.
 *
 * @param {string} tableName - The name of the table.
 * @param {Array} updateList - The list of items to be updated.
 * @param {Object} config - The configuration object for the update.
 * @returns {Promise<Array>} - A promise that resolves to an array of update items.
 * @throws {Exception} - If there is an error during the update process.
 */
async function quickApiUpdateHandler(tableName, updateList, config = DEFAULT_API_UPDATE_CONFIG) {
  logger.debug('Table name', tableName);
  logger.debug('Update list', JSON.stringify(updateList, null, 2));
  logger.debug('Config', JSON.stringify(config, null, 2));

  validateConfig(config);

  let updateItems = [];
  let now = getNowISO();

  try {

    // Add lastUpdated field to each item if config.autoTimestamp is true
    if (config?.autoTimestamp) {
      updateList.map((item) => {
        clearRequestFieldFromAllActions('lastUpdated', item);
        includeFieldInAction('lastUpdated', now, 'set', item, config);
      });
    }

    // Bump version number if config.autoVersion is true
    if (config?.autoVersion) {
      updateList.map((item) => {
        clearRequestFieldFromAllActions('version', item);
        includeFieldInAction('version', 1, 'add', item, config);
      });
    }

    // Iterate over each item in the updateList, create an update object, and add it to the updateItems list
    for (const item of updateList) {

      try {

        // Extract keys from item
        let key = item?.key;
        if (!key || !key?.pk || !key?.sk) {
          throw new Exception(`Malformed item key: ${key}`, { code: 400, error: `Item key must be of the form: {pk: <partition-key>, sk: <sort-key>}` });
        }

        // Extract expressions from item
        let allFields = {
          set: item?.set ? Object.keys(item?.set) : [],
          remove: item?.remove || [],
          add: item?.add ? Object.keys(item?.add) : [],
          append: item?.append ? Object.keys(item?.append) : []
        };

        // Validate fields. Check for duplicates, permissible fields, and missing mandatory fields
        validateUpdateFields(allFields, item, config);
        logger.debug('All fields (validated):', allFields);

        // Build update expression
        const { updateExpression, expressionAttributeNames, expressionAttributeValues } = updateExpressionBuilder(allFields, item);

        logger.debug('Update expression', updateExpression, '\nExpression Attribute Names:', JSON.stringify(expressionAttributeNames, null, 2), '\nExpression Attribute Values:', JSON.stringify(expressionAttributeValues, null, 2));

        // Create updateObject
        const updateObj = {
          action: 'Update',
          data: {
            TableName: tableName,
            Key: marshall(item.key),
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: 'attribute_exists(pk)',

          }
        };
        updateItems.push(updateObj);

      } catch (error) {
        if (config?.failOnError) {
          throw error;
        }
        logger.error(error);
      }

    }
    return updateItems;
  } catch (error) {
    throw error;
  }
}

/**
 * Validates the update fields based on the provided configuration.
 *
 * @param {Object} allFields - The object containing all the fields to be validated.
 * @param {Object} item - The item object containing the fields to be validated.
 * @param {Object} config - The configuration object containing the validation rules.
 * @throws {Exception} Throws an exception if the validation fails.
 */
function validateUpdateFields(allFields, item, config) {
  // If a field is present in multiple expressions, the reqeust is malformed and should be skipped.
  const actions = Object.keys(allFields);
  const fieldsList = actions.reduce((acc, val) => acc.concat(allFields[val]), []);
  let dupeCheck = new Set();

  for (const action of actions) {
    // if no action present in request, continue
    if (!item?.[action]) {
      continue;
    }

    let actionRules = config?.actionRules?.[action];

    // Deny all fields if no action rules are present
    if (!actionRules || actionRules?.allowAll !== true) {
      if (item?.[action]?.length > 0) {
        throw new Exception(`Malformed request: Invalid action`, { code: 400, error: `Action '${action}' is not permitted here.` });
      }
      continue;
    }

    // Allow all fields if `allowAll` is set to true
    if (actionRules?.allowAll) {
      continue;
    }

    // If whitelist is present, ensure each field is on the whitelist
    if (actionRules?.whitelist) {
      for (const field of allFields?.[action]) {
        if (!actionRules.whitelist.includes(field)) {
          throw new Exception(`Field '${field}' is not whitelisted for this action (${action}).`, { code: 400, error: `Malformed request: Updating field '${field}' is not permitted.` });
        }
      }
    }

    // If blacklist is present, ensure each field is not on the blacklist
    if (actionRules?.blacklist) {
      for (const field of allFields?.[action]) {
        if (actionRules.blacklist.includes(field)) {
          throw new Exception(`Field '${field}' is blacklisted for this action (${action}).`, { code: 400, error: `Malformed request: Updating field '${field}' is not permitted.` });
        }
      }
    }

    // If mandatory fields are present, ensure they are present in the request
    if (actionRules?.mandatoryFields) {
      for (const field of actionRules[action].mandatoryFields) {
        if (!item[action].includes(field)) {
          throw new Exception(`Malformed request: Missing mandatory fields`, { code: 400, error: `Field '${field}' was expected in action ${action}.` });
        }
      }
    }
  }


  // Ensure the field is not a duplicate
  for (const field of fieldsList) {
    if (dupeCheck.has(field)) {
      throw new Exception(`Malformed request: Duplicate fields detected`, { code: 400, error: `Field '${field}' is present in multiple expressions` });
    }
    dupeCheck.add(field);
  }

  // If 'add' has fields, ensure their values are numbers
  if (allFields.add?.length > 0) {
    for (const field of allFields.add) {
      if (isNaN(item.add[field])) {
        throw new Exception(`Malformed request: Invalid field type in 'add' action list`, { code: 400, error: `Field '${field}' must be a number` });
      }
    }
  }

  // If 'append' has fields, ensure their values are arrays;
  if (allFields.append?.length > 0) {
    for (const field of allFields.append) {
      if (!Array.isArray(item.append[field])) {
        throw new Exception(`Malformed request: Invalid field type in 'append' action list`, { code: 400, error: `Field '${field}' must be an array` });
      }
    }
  }
}

/**
 * Builds an update expression, expression attribute names, and expression attribute values for DynamoDB update operations.
 *
 * @param {Array} allFields - An array containing the fields to be updated.
 * @param {Object} item - The item containing the values to be updated.
 * @returns {Object} - An object containing the update expression, expression attribute names, and expression attribute values.
 */
function updateExpressionBuilder(allFields, item) {
  // Build update expression
  let setExpression = '', addExpression = '', removeExpression = '';
  let setNames = {}, setValues = {}, removeNames = {};

  // Handle SET expression
  if (allFields.set?.length > 0 || allFields.add?.length > 0 || allFields.append?.length > 0) {

    setExpression = 'SET';
    let setExpPortion = '', addExpPortion = '', appendExpPortion = '';

    // Combine set expressions
    if (allFields.set?.length > 0) {
      setExpPortion = allFields.set.map((field) => ` #${field} = :${field}`);
      allFields.set.map((field) => setNames[`#${field}`] = field);
      allFields.set.map((field) => setValues[`:${field}`] = marshall(item.set[field], {
        convertTopLevelContainer: true,
        removeUndefinedValues: true
      }));
    }

    // Combine add expressions
    if (allFields.add?.length > 0) {
      addExpPortion = allFields.add.map((field) => ` #${field} = if_not_exists(#${field}, :add__start__value) + :${field}`);
      setValues[`:add__start__value`] = marshall(0);
      allFields.add.map((field) => setNames[`#${field}`] = field);
      allFields.add.map((field) => setValues[`:${field}`] = marshall(item.add[field], {
        removeUndefinedValues: true
      }));
    }

    // Combine append expressions
    if (allFields.append?.length > 0) {
      appendExpPortion += allFields.append.map((field) => ` #${field} = list_append(if_not_exists(#${field}, :append__start__value), :${field})`);
      setValues[`:append__start__value`] = { L: [] };
      allFields.append.map((field) => setNames[`#${field}`] = field);
      allFields.append.map((field) => setValues[`:${field}`] = marshall(item.append[field], {
        convertTopLevelContainer: true,
        removeUndefinedValues: true
      }));
    }

    // Combine SET expressions
    setExpression += [setExpPortion, addExpPortion, appendExpPortion].filter((exp) => exp?.length > 0).join(',');
  }

  // Handle REMOVE expression
  if (allFields.remove?.length > 0) {
    removeExpression = 'REMOVE' + allFields.remove.map((field) => ` #${field}`).join(',');
    allFields.remove.map((field) => removeNames[`#${field}`] = field);
  }

  // Combine all expressions
  let updateExpression = [setExpression, addExpression, removeExpression].filter((exp) => exp.length > 0).join(' ');
  const expressionAttributeNames = { ...setNames, ...removeNames };
  const expressionAttributeValues = { ...setValues };

  logger.debug('Update expression:', updateExpression);
  logger.debug('Expression Attribute Names:', expressionAttributeNames);
  logger.debug('Expression Attribute Values:', expressionAttributeValues);

  return { updateExpression, expressionAttributeNames, expressionAttributeValues };
}

function validateConfig(config) {
  if (!config?.actionRules) {
    throw new Exception('Malformed configuration', { code: 400, error: 'Configuration must contain `actionRules` object' });
  }
}

function includeFieldInAction(field, value, action, request, config) {
  if (!request?.[action]) {
    request[action] = {};
  }
  request[action][field] = value;
  // set config to accept new field if whitelist
  if (config?.actionRules?.[action]?.whitelist) {
    config.actionRules[action].whitelist.push(field);
  }
}

function clearRequestFieldFromAllActions(field, request) {
  const actions = ['set', 'add', 'append'];
  for (const action of actions) {
    if (request[action]) {
      delete request[action]?.[field];
    }
    if (request['remove']) {
      request['remove'] = request['remove'].filter((f) => f !== field);
    }
  }
}

module.exports = {
  quickApiUpdateHandler,
};