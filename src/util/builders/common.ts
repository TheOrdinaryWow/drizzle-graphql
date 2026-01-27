import type { Column, Table } from "drizzle-orm";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  is,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notIlike,
  notInArray,
  notLike,
  One,
  or,
  type SQL,
} from "drizzle-orm";
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLError,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from "graphql";
import type { ResolveTree } from "graphql-parse-resolve-info";

import { capitalize } from "@/util/case-ops";
import { remapFromGraphQLCore } from "@/util/data-mappers";
import {
  type ConvertedColumn,
  type ConvertedInputColumn,
  type ConvertedRelationColumnWithArgs,
  drizzleColumnToGraphQLType,
} from "@/util/type-converter";

import type {
  FilterColumnOperators,
  FilterColumnOperatorsCore,
  Filters,
  FiltersCore,
  GeneratedTableTypes,
  GeneratedTableTypesOutputs,
  OrderByArgs,
  ProcessedTableSelectArgs,
  SelectData,
  SelectedColumnsRaw,
  SelectedSQLColumns,
  TableNamedRelations,
  TableSelectArgs,
} from "./types";

const rqbCrashTypes = ["SQLiteBigInt", "SQLiteBlobJson", "SQLiteBlobBuffer"];

export const extractSelectedColumnsFromTree = (tree: Record<string, ResolveTree>, table: Table): Record<string, true> => {
  const tableColumns = getTableColumns(table);

  const treeEntries = Object.entries(tree);
  const selectedColumns: SelectedColumnsRaw = [];

  for (const [_fieldName, fieldData] of treeEntries) {
    if (!tableColumns[fieldData.name]) continue;

    selectedColumns.push([fieldData.name, true]);
  }

  if (!selectedColumns.length) {
    const columnKeys = Object.entries(tableColumns);
    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    const columnName = columnKeys.find((e) => rqbCrashTypes.find((haram) => e[1].columnType !== haram))?.[0] ?? columnKeys[0]![0];

    selectedColumns.push([columnName, true]);
  }

  return Object.fromEntries(selectedColumns);
};

/**
 * Can't automatically determine column type on type level
 * Since drizzle table types extend eachother
 */
export const extractSelectedColumnsFromTreeSQLFormat = <TColType extends Column = Column>(
  tree: Record<string, ResolveTree>,
  table: Table,
): Record<string, TColType> => {
  const tableColumns = getTableColumns(table);

  const treeEntries = Object.entries(tree);
  const selectedColumns: SelectedSQLColumns = [];

  for (const [_fieldName, fieldData] of treeEntries) {
    if (!tableColumns[fieldData.name]) continue;

    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    selectedColumns.push([fieldData.name, tableColumns[fieldData.name]!]);
  }

  if (!selectedColumns.length) {
    const columnKeys = Object.entries(tableColumns);
    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    const columnName = columnKeys.find((e) => rqbCrashTypes.find((haram) => e[1].columnType !== haram))?.[0] ?? columnKeys[0]![0];

    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    selectedColumns.push([columnName, tableColumns[columnName]!]);
  }

  return Object.fromEntries(selectedColumns) as Record<string, TColType>;
};

export const innerOrder = new GraphQLInputObjectType({
  name: "InnerOrder" as const,
  fields: {
    direction: {
      type: new GraphQLNonNull(
        new GraphQLEnumType({
          name: "OrderDirection",
          description: "Order by direction",
          values: {
            asc: {
              value: "asc",
              description: "Ascending order",
            },
            desc: {
              value: "desc",
              description: "Descending order",
            },
          },
        }),
      ),
    },
    priority: { type: new GraphQLNonNull(GraphQLInt), description: "Priority of current field" },
  } as const,
});

const generateColumnFilterValues = (column: Column, tableName: string, columnName: string): GraphQLInputObjectType => {
  const columnGraphQLType = drizzleColumnToGraphQLType(column, columnName, tableName, true, false, true);
  const columnArr = new GraphQLList(new GraphQLNonNull(columnGraphQLType.type));

  const baseFields = {
    eq: { type: columnGraphQLType.type, description: columnGraphQLType.description },
    ne: { type: columnGraphQLType.type, description: columnGraphQLType.description },
    lt: { type: columnGraphQLType.type, description: columnGraphQLType.description },
    lte: { type: columnGraphQLType.type, description: columnGraphQLType.description },
    gt: { type: columnGraphQLType.type, description: columnGraphQLType.description },
    gte: { type: columnGraphQLType.type, description: columnGraphQLType.description },
    like: { type: GraphQLString },
    notLike: { type: GraphQLString },
    ilike: { type: GraphQLString },
    notIlike: { type: GraphQLString },
    inArray: { type: columnArr, description: `Array<${columnGraphQLType.description}>` },
    notInArray: { type: columnArr, description: `Array<${columnGraphQLType.description}>` },
    isNull: { type: GraphQLBoolean },
    isNotNull: { type: GraphQLBoolean },
  };

  const type: GraphQLInputObjectType = new GraphQLInputObjectType({
    name: `${capitalize(tableName)}${capitalize(columnName)}Filters`,
    fields: {
      ...baseFields,
      OR: {
        type: new GraphQLList(
          new GraphQLNonNull(
            new GraphQLInputObjectType({
              name: `${capitalize(tableName)}${capitalize(columnName)}filtersOr`,
              fields: {
                ...baseFields,
              },
            }),
          ),
        ),
      },
    },
  });

  return type;
};

// biome-ignore lint/complexity/noBannedTypes: special `Object` case
const orderMap = new WeakMap<Object, Record<string, ConvertedInputColumn>>();
const generateTableOrderCached = (table: Table) => {
  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  if (orderMap.has(table)) return orderMap.get(table)!;

  const columns = getTableColumns(table);
  const columnEntries = Object.entries(columns);

  const remapped = Object.fromEntries(columnEntries.map(([columnName, _columnDescription]) => [columnName, { type: innerOrder }]));

  orderMap.set(table, remapped);

  return remapped;
};

// biome-ignore lint/complexity/noBannedTypes: special `Object` case
const filterMap = new WeakMap<Object, Record<string, ConvertedInputColumn>>();
const generateTableFilterValuesCached = (table: Table, tableName: string) => {
  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  if (filterMap.has(table)) return filterMap.get(table)!;

  const columns = getTableColumns(table);
  const columnEntries = Object.entries(columns);

  const remapped = Object.fromEntries(
    columnEntries.map(([columnName, columnDescription]) => [
      columnName,
      {
        type: generateColumnFilterValues(columnDescription, tableName, columnName),
      },
    ]),
  );

  filterMap.set(table, remapped);

  return remapped;
};

// biome-ignore lint/complexity/noBannedTypes: special `Object` case
const fieldMap = new WeakMap<Object, Record<string, ConvertedColumn>>();
const generateTableSelectTypeFieldsCached = (table: Table, tableName: string): Record<string, ConvertedColumn> => {
  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  if (fieldMap.has(table)) return fieldMap.get(table)!;

  const columns = getTableColumns(table);
  const columnEntries = Object.entries(columns);

  const remapped = Object.fromEntries(
    columnEntries.map(([columnName, columnDescription]) => [
      columnName,
      drizzleColumnToGraphQLType(columnDescription, columnName, tableName),
    ]),
  );

  fieldMap.set(table, remapped);

  return remapped;
};

// biome-ignore lint/complexity/noBannedTypes: special `Object` case
const orderTypeMap = new WeakMap<Object, GraphQLInputObjectType>();
const generateTableOrderTypeCached = (table: Table, tableName: string) => {
  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  if (orderTypeMap.has(table)) return orderTypeMap.get(table)!;

  const orderColumns = generateTableOrderCached(table);
  const order = new GraphQLInputObjectType({
    name: `${capitalize(tableName)}OrderBy`,
    fields: orderColumns,
  });

  orderTypeMap.set(table, order);

  return order;
};

// biome-ignore lint/complexity/noBannedTypes: special `Object` case
const filterTypeMap = new WeakMap<Object, GraphQLInputObjectType>();
const generateTableFilterTypeCached = (table: Table, tableName: string) => {
  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  if (filterTypeMap.has(table)) return filterTypeMap.get(table)!;

  const filterColumns = generateTableFilterValuesCached(table, tableName);
  const filters: GraphQLInputObjectType = new GraphQLInputObjectType({
    name: `${capitalize(tableName)}Filters`,
    fields: {
      ...filterColumns,
      OR: {
        type: new GraphQLList(
          new GraphQLNonNull(
            new GraphQLInputObjectType({
              name: `${capitalize(tableName)}FiltersOr`,
              fields: filterColumns,
            }),
          ),
        ),
      },
    },
  });

  filterTypeMap.set(table, filters);

  return filters;
};

const generateSelectFields = <TWithOrder extends boolean>(
  tables: Record<string, Table>,
  tableName: string,
  relationMap: Record<string, Record<string, TableNamedRelations>>,
  typeName: string,
  withOrder: TWithOrder,
  relationsDepthLimit: number | undefined,
  currentDepth: number = 0,
  usedTables: Set<string> = new Set(),
): SelectData<TWithOrder> => {
  const relations = relationMap[tableName];
  const relationEntries: [string, TableNamedRelations][] = relations ? Object.entries(relations) : [];

  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  const table = tables[tableName]!;

  const order = withOrder ? generateTableOrderTypeCached(table, tableName) : undefined;

  const filters = generateTableFilterTypeCached(table, tableName);

  const tableFields = generateTableSelectTypeFieldsCached(table, tableName);

  if (
    usedTables.has(tableName) ||
    (typeof relationsDepthLimit === "number" && currentDepth >= relationsDepthLimit) ||
    !relationEntries.length
  ) {
    return {
      order,
      filters,
      tableFields,
      relationFields: {},
    } as SelectData<TWithOrder>;
  }

  const rawRelationFields: [string, ConvertedRelationColumnWithArgs][] = [];
  const updatedUsedTables = new Set(usedTables).add(tableName);
  const newDepth = currentDepth + 1;

  for (const [relationName, { targetTableName, relation }] of relationEntries) {
    const relTypeName = `${typeName}${capitalize(relationName)}Relation`;
    const isOne = is(relation, One);

    const relData = generateSelectFields(
      tables,
      targetTableName,
      relationMap,
      relTypeName,
      !isOne,
      relationsDepthLimit,
      newDepth,
      updatedUsedTables,
    );

    const relType = new GraphQLObjectType({
      name: relTypeName,
      fields: { ...relData.tableFields, ...relData.relationFields },
    });

    if (isOne) {
      rawRelationFields.push([
        relationName,
        {
          type: relType,
          args: {
            where: { type: relData.filters },
          },
        },
      ]);

      continue;
    }

    rawRelationFields.push([
      relationName,
      {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(relType))),
        args: {
          where: { type: relData.filters },
          // biome-ignore lint/style/noNonNullAssertion: prevent ts error
          orderBy: { type: relData.order! },
          offset: { type: GraphQLInt },
          limit: { type: GraphQLInt },
        },
      },
    ]);
  }

  const relationFields = Object.fromEntries(rawRelationFields);

  return { order, filters, tableFields, relationFields } as SelectData<TWithOrder>;
};

export const generateTableTypes = <WithReturning extends boolean>(
  tableName: string,
  tables: Record<string, Table>,
  relationMap: Record<string, Record<string, TableNamedRelations>>,
  withReturning: WithReturning,
  relationsDepthLimit: number | undefined,
): GeneratedTableTypes<WithReturning> => {
  const stylizedName = capitalize(tableName);
  const { tableFields, relationFields, filters, order } = generateSelectFields(
    tables,
    tableName,
    relationMap,
    stylizedName,
    true,
    relationsDepthLimit,
  );

  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  const table = tables[tableName]!;
  const columns = getTableColumns(table);
  const columnEntries = Object.entries(columns);

  const insertFields = Object.fromEntries(
    columnEntries.map(([columnName, columnDescription]) => [
      columnName,
      drizzleColumnToGraphQLType(columnDescription, columnName, tableName, false, true, true),
    ]),
  );

  const updateFields = Object.fromEntries(
    columnEntries.map(([columnName, columnDescription]) => [
      columnName,
      drizzleColumnToGraphQLType(columnDescription, columnName, tableName, true, false, true),
    ]),
  );

  const insertInput = new GraphQLInputObjectType({
    name: `${stylizedName}InsertInput`,
    fields: insertFields,
  });

  const selectSingleOutput = new GraphQLObjectType({
    name: `${stylizedName}SelectItem`,
    fields: { ...tableFields, ...relationFields },
  });

  const selectArrOutput = new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(selectSingleOutput)));

  const singleTableItemOutput = withReturning
    ? new GraphQLObjectType({
        name: `${stylizedName}Item`,
        fields: tableFields,
      })
    : undefined;

  // biome-ignore lint/style/noNonNullAssertion: prevent ts error
  const arrTableItemOutput = withReturning ? new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(singleTableItemOutput!))) : undefined;

  const updateInput = new GraphQLInputObjectType({
    name: `${stylizedName}UpdateInput`,
    fields: updateFields,
  });

  const inputs = {
    insertInput,
    updateInput,
    tableOrder: order,
    tableFilters: filters,
  };

  const outputs = (
    withReturning
      ? {
          selectSingleOutput,
          selectArrOutput,
          // biome-ignore lint/style/noNonNullAssertion: prevent ts error
          singleTableItemOutput: singleTableItemOutput!,
          // biome-ignore lint/style/noNonNullAssertion: prevent ts error
          arrTableItemOutput: arrTableItemOutput!,
        }
      : {
          selectSingleOutput,
          selectArrOutput,
        }
  ) as GeneratedTableTypesOutputs<WithReturning>;

  return {
    inputs,
    outputs,
  };
};

export const extractOrderBy = <TTable extends Table, TArgs extends OrderByArgs<any> = OrderByArgs<TTable>>(
  table: TTable,
  orderArgs: TArgs,
): SQL[] => {
  const res = [] as SQL[];

  for (const [column, config] of Object.entries(orderArgs).sort((a, b) => (b[1]?.priority ?? 0) - (a[1]?.priority ?? 0))) {
    if (!config) continue;
    const { direction } = config;

    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    res.push(direction === "asc" ? asc(getTableColumns(table)[column]!) : desc(getTableColumns(table)[column]!));
  }

  return res;
};

export const extractFiltersColumn = <TColumn extends Column>(
  column: TColumn,
  columnName: string,
  operators: FilterColumnOperators<TColumn>,
): SQL | undefined => {
  if (!operators.OR?.length) delete operators.OR;

  const entries = Object.entries(operators as FilterColumnOperatorsCore<TColumn>);

  if (operators.OR) {
    if (entries.length > 1) {
      throw new GraphQLError(`WHERE ${columnName}: Cannot specify both fields and 'OR' in column operators!`);
    }

    const variants = [] as SQL[];

    for (const variant of operators.OR) {
      const extracted = extractFiltersColumn(column, columnName, variant);

      if (extracted) variants.push(extracted);
    }

    return variants.length ? (variants.length > 1 ? or(...variants) : variants[0]) : undefined;
  }

  const variants = [] as SQL[];
  for (const [operatorName, operatorValue] of entries) {
    if (operatorValue === null || operatorValue === false) continue;

    let operator: ((...args: any[]) => SQL) | undefined;
    switch (operatorName as keyof FilterColumnOperatorsCore<TColumn>) {
      case "eq": {
        operator = operator ?? eq;
        const singleValue = remapFromGraphQLCore(operatorValue, column, columnName);
        variants.push(operator(column, singleValue));
        break;
      }
      case "ne": {
        operator = operator ?? ne;
        const singleValue = remapFromGraphQLCore(operatorValue, column, columnName);
        variants.push(operator(column, singleValue));
        break;
      }
      case "gt": {
        operator = operator ?? gt;
        const singleValue = remapFromGraphQLCore(operatorValue, column, columnName);
        variants.push(operator(column, singleValue));
        break;
      }
      case "gte": {
        operator = operator ?? gte;
        const singleValue = remapFromGraphQLCore(operatorValue, column, columnName);
        variants.push(operator(column, singleValue));
        break;
      }
      case "lt": {
        operator = operator ?? lt;
        const singleValue = remapFromGraphQLCore(operatorValue, column, columnName);
        variants.push(operator(column, singleValue));
        break;
      }
      case "lte": {
        operator = operator ?? lte;
        const singleValue = remapFromGraphQLCore(operatorValue, column, columnName);
        variants.push(operator(column, singleValue));
        break;
      }

      case "like": {
        operator = operator ?? like;
        variants.push(operator(column, operatorValue as string));
        break;
      }
      case "notLike": {
        operator = operator ?? notLike;
        variants.push(operator(column, operatorValue as string));
        break;
      }
      case "ilike": {
        operator = operator ?? ilike;
        variants.push(operator(column, operatorValue as string));
        break;
      }
      case "notIlike": {
        operator = operator ?? notIlike;
        variants.push(operator(column, operatorValue as string));
        break;
      }

      case "inArray": {
        operator = operator ?? inArray;
        if (!(operatorValue as any[]).length) {
          throw new GraphQLError(`WHERE ${columnName}: Unable to use operator ${operatorName} with an empty array!`);
        }
        const arrayValue = (operatorValue as any[]).map((val) => remapFromGraphQLCore(val, column, columnName));
        variants.push(operator(column, arrayValue));
        break;
      }
      case "notInArray": {
        operator = operator ?? notInArray;
        if (!(operatorValue as any[]).length) {
          throw new GraphQLError(`WHERE ${columnName}: Unable to use operator ${operatorName} with an empty array!`);
        }
        const arrayValue = (operatorValue as any[]).map((val) => remapFromGraphQLCore(val, column, columnName));
        variants.push(operator(column, arrayValue));
        break;
      }

      case "isNull": {
        operator = operator ?? isNull;
        variants.push(operator(column));
        break;
      }
      case "isNotNull": {
        operator = operator ?? isNotNull;
        variants.push(operator(column));
        break;
      }
    }
  }

  return variants.length ? (variants.length > 1 ? and(...variants) : variants[0]) : undefined;
};

export const extractFilters = <TTable extends Table>(table: TTable, tableName: string, filters: Filters<TTable>): SQL | undefined => {
  if (!filters.OR?.length) delete filters.OR;

  const entries = Object.entries(filters as FiltersCore<TTable>);
  if (!entries.length) return;

  if (filters.OR) {
    if (entries.length > 1) {
      throw new GraphQLError(`WHERE ${tableName}: Cannot specify both fields and 'OR' in table filters!`);
    }

    const variants = [] as SQL[];

    for (const variant of filters.OR) {
      const extracted = extractFilters(table, tableName, variant);
      if (extracted) variants.push(extracted);
    }

    return variants.length ? (variants.length > 1 ? or(...variants) : variants[0]) : undefined;
  }

  const variants = [] as SQL[];
  for (const [columnName, operators] of entries) {
    if (operators === null) continue;

    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    const column = getTableColumns(table)[columnName]!;
    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    variants.push(extractFiltersColumn(column, columnName, operators)!);
  }

  return variants.length ? (variants.length > 1 ? and(...variants) : variants[0]) : undefined;
};

const extractRelationsParamsInner = (
  relationMap: Record<string, Record<string, TableNamedRelations>>,
  tables: Record<string, Table>,
  tableName: string,
  typeName: string,
  originField: ResolveTree,
  isInitial: boolean = false,
) => {
  const relations = relationMap[tableName];
  if (!relations) return undefined;

  const baseField = Object.entries(originField.fieldsByTypeName).find(([key, _value]) => key === typeName)?.[1];
  if (!baseField) return undefined;

  const args: Record<string, Partial<ProcessedTableSelectArgs>> = {};

  for (const [relName, { targetTableName }] of Object.entries(relations)) {
    const relTypeName = `${isInitial ? capitalize(tableName) : typeName}${capitalize(relName)}Relation`;
    const relFieldSelection = Object.values(baseField).find((field) => field.name === relName)?.fieldsByTypeName[relTypeName];
    if (!relFieldSelection) continue;

    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    const columns = extractSelectedColumnsFromTree(relFieldSelection, tables[targetTableName]!);

    const thisRecord: Partial<ProcessedTableSelectArgs> = {};
    thisRecord.columns = columns;

    const relationField = Object.values(baseField).find((e) => e.name === relName);
    const relationArgs: Partial<TableSelectArgs> | undefined = relationField?.args;

    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    const orderBy = relationArgs?.orderBy ? extractOrderBy(tables[targetTableName]!, relationArgs.orderBy!) : undefined;
    // biome-ignore lint/style/noNonNullAssertion: prevent ts error
    const where = relationArgs?.where ? extractFilters(tables[targetTableName]!, relName, relationArgs?.where) : undefined;
    const offset = relationArgs?.offset ?? undefined;
    const limit = relationArgs?.limit ?? undefined;

    thisRecord.orderBy = orderBy;
    thisRecord.where = where;
    thisRecord.offset = offset;
    thisRecord.limit = limit;

    const relWith = relationField
      ? extractRelationsParamsInner(relationMap, tables, targetTableName, relTypeName, relationField)
      : undefined;
    thisRecord.with = relWith;

    args[relName] = thisRecord;
  }

  return args;
};

export const extractRelationsParams = (
  relationMap: Record<string, Record<string, TableNamedRelations>>,
  tables: Record<string, Table>,
  tableName: string,
  info: ResolveTree | undefined,
  typeName: string,
): Record<string, Partial<ProcessedTableSelectArgs>> | undefined => {
  if (!info) return undefined;

  return extractRelationsParamsInner(relationMap, tables, tableName, typeName, info, true);
};
