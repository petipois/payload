import { GraphQLBoolean, GraphQLInputObjectType, GraphQLString, GraphQLList, GraphQLFloat, GraphQLEnumType, GraphQLInt } from 'graphql';
import type { GraphQLType } from 'graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { DateTimeResolver, EmailAddressResolver } from 'graphql-scalars';
import { FieldAffectingData, NumberField, RadioField, SelectField, optionIsObject } from '../../fields/config/types';
import combineParentName from '../utilities/combineParentName';
import formatName from '../utilities/formatName';
import operators from './operators';

type staticTypes = 'number' | 'text' | 'email' | 'textarea' | 'richText' | 'json' | 'code' | 'checkbox' | 'date' | 'upload' | 'point' | 'relationship'

type dynamicTypes = 'radio' | 'select'

const GeoJSONObject = new GraphQLInputObjectType({
  name: 'GeoJSONObject',
  fields: {
    type: { type: GraphQLString },
    coordinates: {
      type: GraphQLJSON,
    },
  },
});

type DefaultsType = {
  [key in staticTypes]: {
    operators: {
      name: string;
      type: GraphQLType | ((field: FieldAffectingData, parentName: string) => GraphQLType);
    }[];
  }
} & {
  [key in dynamicTypes]: {
    operators: {
      name: string;
      type: ((field: FieldAffectingData, parentName: string) => GraphQLType);
    }[];
  }
}

const defaults: DefaultsType = {
  number: {
    operators: [
      ...[...operators.equality, ...operators.comparison].map((operator) => ({
        name: operator,
        type: (field: NumberField): GraphQLType => {
          return field?.name === 'id' ? GraphQLInt : GraphQLFloat;
        },
      })),
    ],
  },
  text: {
    operators: [
      ...[...operators.equality, ...operators.partial, ...operators.contains].map((operator) => ({
        name: operator,
        type: GraphQLString,
      })),
    ],
  },
  email: {
    operators: [
      ...[...operators.equality, ...operators.partial, ...operators.contains].map((operator) => ({
        name: operator,
        type: EmailAddressResolver,
      })),
    ],
  },
  textarea: {
    operators: [
      ...[...operators.equality, ...operators.partial].map((operator) => ({
        name: operator,
        type: GraphQLString,
      })),
    ],
  },
  richText: {
    operators: [
      ...[...operators.equality, ...operators.partial].map((operator) => ({
        name: operator,
        type: GraphQLJSON,
      })),
    ],
  },
  json: {
    operators: [
      ...[...operators.equality, ...operators.partial, ...operators.geojson].map((operator) => ({
        name: operator,
        type: GraphQLJSON,
      })),
    ],
  },
  code: {
    operators: [
      ...[...operators.equality, ...operators.partial].map((operator) => ({
        name: operator,
        type: GraphQLString,
      })),
    ],
  },
  radio: {
    operators: [
      ...[...operators.equality, ...operators.partial].map((operator) => ({
        name: operator,
        type: (field: RadioField, parentName): GraphQLType => new GraphQLEnumType({
          name: `${combineParentName(parentName, field.name)}_Input`,
          values: field.options.reduce((values, option) => {
            if (optionIsObject(option)) {
              return {
                ...values,
                [formatName(option.value)]: {
                  value: option.value,
                },
              };
            }

            return {
              ...values,
              [formatName(option)]: {
                value: option,
              },
            };
          }, {}),
        }),
      })),
    ],
  },
  date: {
    operators: [
      ...[...operators.equality, ...operators.comparison, 'like'].map((operator) => ({
        name: operator,
        type: DateTimeResolver,
      })),
    ],
  },
  point: {
    operators: [
      ...[...operators.equality, ...operators.comparison, ...operators.geo].map((operator) => ({
        name: operator,
        type: new GraphQLList(GraphQLFloat),
      })),
      ...operators.geojson.map((operator) => ({
        name: operator,
        /**
         * @example:
         * within: {
         *  type: "Polygon",
         *  coordinates: [[
         *   [0.0, 0.0],
         *   [1.0, 1.0],
         *   [1.0, 0.0],
         *   [0.0, 0.0],
         *  ]],
         * }
         * @example
         * intersects: {
         *  type: "Point",
         *  coordinates: [ 0.5, 0.5 ]
         * }
         */
        type: GeoJSONObject,
      })),
    ],
  },
  relationship: {
    operators: [
      ...[...operators.equality, ...operators.contains].map((operator) => ({
        name: operator,
        type: GraphQLString,
      })),
    ],
  },
  upload: {
    operators: [
      ...operators.equality.map((operator) => ({
        name: operator,
        type: GraphQLString,
      })),
    ],
  },
  checkbox: {
    operators: [
      ...operators.equality.map((operator) => ({
        name: operator,
        type: GraphQLBoolean,
      })),
    ],
  },
  select: {
    operators: [
      ...[...operators.equality, ...operators.contains].map((operator) => ({
        name: operator,
        type: (field: SelectField, parentName): GraphQLType => new GraphQLEnumType({
          name: `${combineParentName(parentName, field.name)}_Input`,
          values: field.options.reduce((values, option) => {
            if (typeof option === 'object' && option.value) {
              return {
                ...values,
                [formatName(option.value)]: {
                  value: option.value,
                },
              };
            }

            if (typeof option === 'string') {
              return {
                ...values,
                [option]: {
                  value: option,
                },
              };
            }

            return values;
          }, {}),
        }),
      })),
    ],
  },
  // array: n/a
  // group: n/a
  // row: n/a
  // collapsible: n/a
  // tabs: n/a
};

const listOperators = ['in', 'not_in', 'all'];

const gqlTypeCache: Record<string, GraphQLType> = {};

/**
 * In GraphQL, you can use "where" as an argument to filter a collection. Example:
 * { Posts(where: { title: { equals: "Hello" } }) { text } }
 * This function defines the operators for a field's condition in the "where" argument of the collection (it thus gets called for every field).
 * For example, in the example above, it would control that
 * - "equals" is a valid operator for the "title" field
 * - the accepted type of the "equals" argument has to be a string.
 *
 * @param field the field for which their valid operators inside a "where" argument is being defined
 * @param parentName the name of the parent field (if any)
 * @returns all the operators (including their types) which can be used as a condition for a given field inside a where
 */
export const withOperators = (field: FieldAffectingData, parentName: string): GraphQLInputObjectType => {
  if (!defaults?.[field.type]) throw new Error(`Error: ${field.type} has no defaults configured.`);

  const name = `${combineParentName(parentName, field.name)}_operator`;

  // Get the default operators for the field type which are hard-coded above
  const fieldOperators = [...defaults[field.type].operators];

  if (!('required' in field) || !field.required) {
    fieldOperators.push({
      name: 'exists',
      type: fieldOperators[0].type,
    });
  }


  return new GraphQLInputObjectType({
    name,
    fields: fieldOperators.reduce((objectTypeFields, operator) => {
      // Get the type of the operator. It can be either static, or dynamic (=> a function)
      let gqlType: GraphQLType = typeof operator.type === 'function'
        ? operator.type(field, parentName)
        : operator.type;

      // GraphQL does not allow types with duplicate names, so we use this cache to avoid that.
      // Without this, select and radio fields would have the same name, and GraphQL would throw an error
      // This usually only happens if a custom type is returned from the operator.type function
      if (typeof operator.type === 'function' && 'name' in gqlType) {
        if (gqlTypeCache[gqlType.name]) {
          gqlType = gqlTypeCache[gqlType.name];
        } else {
          gqlTypeCache[gqlType.name] = gqlType;
        }
      }

      if (listOperators.includes(operator.name)) {
        gqlType = new GraphQLList(gqlType);
      } else if (operator.name === 'exists') {
        gqlType = GraphQLBoolean;
      }

      return {
        ...objectTypeFields,
        [operator.name]: {
          type: gqlType,
        },
      };
    }, {}),
  });
};
