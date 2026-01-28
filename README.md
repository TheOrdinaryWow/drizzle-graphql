# Drizzle-GraphQL

Automatically create GraphQL schema or customizable schema config fields from Drizzle ORM schema

## Modifications and Maintenance

This repository is a fork of the original [drizzle-orm/drizzle-graphql](https://github.com/drizzle-team/drizzle-graphql). Since the original repository is no longer actively maintained, I have taken the initiative to continue its development and maintenance. Contributions and feedback from the community are welcomed to help improve this project.

For personal opinions, I've migrated whole stack from `npm`, `pnpm` to `bun` as well as other tooling changes mentioned below.

### Features in this fork:

* Add "Count" to generated types for count queries (PostgreSQL only for now!)
* Fix handling of JSONB
* Fix handling of tsvector types
* Fix handling of generated columns
* Export essential functions for external usage

### Changes in the toolchain:

* Replace `vitest` with `bun:test` for testing
* Replace `tsup` with `bunup` for building
* Use `biomejs` for linting and formatting

## Usage

-   Pass your drizzle database instance and schema into builder to generate `{ schema, entities }` object
-   Use `schema` if pre-built schema already satisfies all your needs. It's compatible witn any server that consumes `GraphQLSchema` class instance

    Example: hosting schema using [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)

    ```Typescript
    import { createServer } from 'node:http'
    import { createYoga } from 'graphql-yoga'
    import { buildSchema } from '@woooow/drizzle-graphql'

    // db - your drizzle instance
    import { db } from './database'

    const { schema } = buildSchema(db)

    const yoga = createYoga({ schema })

    server.listen(4000, () => {
        console.info('Server is running on http://localhost:4000/graphql')
    })
    ```

-   If you want to customize your schema, you can use `entities` object to build your own new schema

    ```Typescript
    import { createServer } from 'node:http'
    import { GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema } from 'graphql'
    import { createYoga } from 'graphql-yoga'
    import { buildSchema } from '@woooow/drizzle-graphql'

    // Schema contains 'Users' and 'Customers' tables
    import { db } from './database'

    const { entities } = buildSchema(db)

    // You can customize which parts of queries or mutations you want
    const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
            name: 'Query',
            fields: {
                // Select only wanted queries out of all generated
                users: entities.queries.users,
                customer: entities.queries.customersSingle,

                // Create a custom one
                customUsers: {
                    // You can reuse and customize types from original schema
                    type: new GraphQLList(new GraphQLNonNull(entities.types.UsersItem)),
                    args: {
                        // You can reuse inputs as well
                        where: {
                            type: entities.inputs.UsersFilters
                        }
                    },
                    resolve: async (source, args, context, info) => {
                        // Your custom logic goes here...
                        const result = await db.select(schema.Users).where()...

                        return result
                    }
                }
            }
        }),
        // Same rules apply to mutations
        mutation: new GraphQLObjectType({
            name: 'Mutation',
            fields: entities.mutations
        }),
        // In case you need types inside your schema
        types: [...Object.values(entities.types), ...Object.values(entities.inputs)]
    })

    const yoga = createYoga({
        schema
    })

    server.listen(4000, () => {
        console.info('Server is running on http://localhost:4000/graphql')
    })
    ```

## Acknowledgements

This project builds upon the excellent work from multiple sources:

- **[drizzle-team/drizzle-graphql](https://github.com/drizzle-team/drizzle-graphql)** - The original implementation that served as the foundation for this project
- **[TimMensch/drizzle-graphql](https://github.com/TimMensch/drizzle-graphql)** - Significant portions of code and improvements were adapted from this fork
