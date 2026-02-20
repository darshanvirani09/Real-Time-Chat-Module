import { schemaMigrations, createTable, addColumns } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'app_settings',
          columns: [
            { name: 'self_id', type: 'string', isOptional: true },
            { name: 'self_name', type: 'string', isOptional: true },
            { name: 'self_mobile', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'socket_url', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
})
