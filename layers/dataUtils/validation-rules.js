const { DateTime, Exception } = require('/opt/base');

class rulesFns {

  regexMatch(value, regex) {
    if (!regex.test(value)) {
      throw new Exception(`Invalid value: Expected ${value} to match regex: ${regex}`, { code: 400 });
    }
  }

  /**
   * Validates that the type of a given value matches one of the expected types.
   *
   * @param {*} value - The value to be checked.
   * @param {string[]} types - An array of expected types as strings.
   * @throws {Exception} Throws an exception if the type of the value does not match any of the expected types.
   */
  expectType(value, types) {
    if (!types.includes(typeof value)) {
      throw new Exception(`Invalid type: Expected ${value} to be one of type: [${types}]`, { code: 400 });
    }
  }

  /**
   * Validates if the provided action is included in the list of allowed actions.
   * Throws an exception if the action is not permitted.
   *
   * @param {string} action - The action to validate.
   * @param {string[]} actions - The list of allowed actions.
   * @throws {Exception} Throws an exception if the action is not in the list of allowed actions.
   */
  expectAction(action, allowedActions) {
    if (!allowedActions.includes(action)) {
      throw new Exception(`Invalid action: Expected '${action}' to be one of: [${allowedActions}]. Action '${action}' is not permitted on this field.`, { code: 400 });
    }
  }

  /**
   * Validates that the given value is an object representing a 24-hour time format.
   * The object should contain at least the 'hour' property and optionally 'minute' and 'second' properties.
   *
   * @param {Object} value - The object to validate.
   * @param {number} value.hour - The hour value (0-23).
   * @param {number} [value.minute] - The optional minute value (0-59).
   * @param {number} [value.second] - The optional second value (0-59).
   * @throws {Exception} Throws an exception if the object does not match the expected format.
   */
  expect24hTimeObjFormat(value) {
    const timeIncrements = ['hour', 'minute', 'second'];
    for (const key in value) {
      if (!timeIncrements.includes(key)) {
        throw new Exception('Invalid time format: Expected {hour: <0-23>, minute?: <0-59>, second?: <0-59>}', { code: 400 });
      }
      this.expectInteger(value[key]);
    }
    if (!value || !value?.hour || !Object.keys(timeIncrements).some(key => value.includes(key))) {
      throw new Exception('Invalid time format: Expected {hour: <0-23>, minute?: <0-59>, second?: <0-59>}', { code: 400 });
    }
  }

  /**
   * Validates that a given value is present in a specified list.
   *
   * @param {*} value - The value to check.
   * @param {Array} list - The list of valid values.
   * @throws {Exception} Throws an exception if the value is not in the list, with a message indicating the invalid value and the expected list.
   */
  expectValueInList(value, list) {
    if (!list.includes(value)) {
      throw new Exception(`Invalid value: Expected ${value} to be one of ${list}`, { code: 400 });
    }
  }

  /**
   * Validates the format of a duration object.
   *
   * The duration object can contain the following optional properties:
   * - years: <number>
   * - months: <number>
   * - weeks: <0-3>
   * - days: <0-6>
   * - hours: <0-23>
   * - minutes: <0-59>
   * - seconds: <0-59>
   *
   * Each property, if present, must be an integer.
   *
   * @param {Object} value - The duration object to validate.
   * @throws {Exception} Throws an exception if the duration object contains invalid keys or values.
   */
  expectDurationObjFormat(value) {
    const durationIncrements = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
    for (const key in value) {
      if (!durationIncrements.includes(key)) {
        throw new Exception('Invalid duration format: Expected {years?: <number>, months?: <number>, weeks?: <0-3>, days?: <0-6>, hours?: <0-23>, minutes?: <0-59>, seconds?: <0-59>}', { code: 400 });
      }
      this.expectInteger(value[key]);
    }
    if (!value || !Object.keys(durationIncrements).some(key => value.includes(key))) {
      throw new Exception('Invalid duration format: Expected {years?: <number>, months?: <number>, weeks?: <number>, days?: <number>, hours?: <number>, minutes?: <number>, seconds?: <number>}', { code: 400 });
    }
  }

  /**
   * Validates that the provided value is an integer.
   *
   * @param {number} value - The value to be validated.
   * @param {boolean} [allowNegative=false] - Whether negative integers are allowed.
   * @throws {Exception} Throws an exception if the value is not an integer or if negative integers are not allowed and the value is negative.
   */
  expectInteger(value, allowNegative = false) {
    if (!Number.isInteger(value)) {
      throw new Exception(`Invalid value: Expected ${value} to be an integer`, { code: 400 });
    }
    if (!allowNegative && value < 0) {
      throw new Exception(`Invalid value: Expected ${value} to be a positive integer`, { code: 400 });
    }
  }

  /**
   * Validates that the given value is a currency amount (enforces 0-2 decimal places).
   *
   * @param {number} value - The value to be validated as currency.
   * @param {boolean} [allowNegative=false] - Whether to allow negative currency values.
   * @throws {Exception} Throws an exception if the value is negative and allowNegative is false.
   */
  expectCurrency(value, allowNegative = false) {
    this.expectType(value, ['number']);
    if (!allowNegative && value < 0) {
      throw new Exception('Invalid value: Expected currency value to be positive', { code: 400 });
    }
    this.regexMatch(value, new RegExp("^\\d+(?:\\.\\d{1,2})?$"));
  }

  /**
   * Validates if the given value is in ISO 8601 date string format.
   * Throws an exception if the value is not a valid ISO 8601 date string.
   *
   * @param {string} value - The date string to validate.
   * @throws {Exception} Throws an exception if the date format is invalid.
   */
  expectISODateTimeObjFormat(value) {
    const d = new Date(value);
    if (!Number.isNaN(d.valueOf()) && d.toISOString() === value) {
      throw new Exception('Invalid date format: Expected ISO 8601 date string', { code: 400 });
    };
  }

  /**
   * Validates if the given value is in the expected ISO date string format.
   *
   * @param {string} value - The date string to validate.
   * @param {string} [format='yyyy-LL-dd'] - The expected date format. Defaults to 'yyyy-LL-dd'.
   * @throws {Exception} Throws an exception if the date string is not in the expected format.
   */
  expectISODateObjFormat(value, format = 'yyyy-LL-dd') {
    let dateTime = DateTime.fromFormat(value, format);
    if (!dateTime || !dateTime.isValid) {
      throw new Exception(`Date or date format is invalid: Expected ISO date string in the format ${format}`, { code: 400 });
    }
  }

  /**
   * Validates that a number is within a specified range.
   *
   * @param {number} value - The number to validate.
   * @param {number} min - The minimum value of the range.
   * @param {number} max - The maximum value of the range.
   * @param {boolean} [inclusive=true] - Whether the range is inclusive. If true, the value can be equal to min or max.
   * @throws {Exception} Throws an exception if the value is not within the specified range.
   */
  expectInRange(value, min, max, inclusive = true) {
    this.expectType(value, ['number']);
    if (inclusive) {
      if (value < min || value > max) {
        throw new Exception(`Invalid value: Expected ${value} to be equal to or between ${min} and ${max}`, { code: 400 });
      } else {
        if (value <= min || value >= max) {
          throw new Exception(`Invalid value: Expected ${value} to be between ${min} and ${max}`, { code: 400 });
        }
      }
    }
  }

  /**
   * Validates that the given latitude value is within the acceptable range.
   *
   * @param {number} value - The latitude value to be validated.
   * @throws {RangeError} Throws an error if the latitude value is not within the range of -90 to 90.
   */
  expectLatitude(value) {
    this.expectInRange(value, -90, 90);
  }

  /**
   * Validates that the given value is a valid longitude.
   * Longitude must be within the range of -180 to 180 degrees.
   *
   * @param {number} value - The value to be validated as a longitude.
   */
  expectLongitude(value) {
    this.expectInRange(value, -180, 180);
  }

  /**
   * Validates if the provided value is a valid GeoJSON Point object.
   *
   * @param {Object} value - The value to be validated.
   * @param {string} value.type - The type of the GeoJSON object, expected to be 'Point'.
   * @param {Array} value.coordinates - The coordinates of the GeoJSON Point, expected to be an array with two elements of the format [longitude, latitude].
   * @throws {Exception} Throws an exception if the type is not 'Point' or if the coordinates are not a valid array with two elements.
   */
  expectGeopoint(value) {
    if (!value?.type || value?.type !== 'Point') {
      throw new Exception(`Invalid geopoint type: Expected 'type' to be 'Point'`, { code: 400 });
    }
    const coords = value?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) {
      throw new Exception('Invalid geopoint coordinates: Expected coordinates to be an array with two elements', { code: 400 });
    }
    this.expectLongitude(coords[0]);
    this.expectLatitude(coords[1]);
  }
}

module.exports = {
  rulesFns
};