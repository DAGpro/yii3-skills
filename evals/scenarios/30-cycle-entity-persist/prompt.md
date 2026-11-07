We migrated the tags module of the blog to Cycle ORM through the yiisoft/yii-cycle bridge. The entity attributes, the DBAL config in params and the schema side all look fine, but since the switch, tags created through POST /tags never actually appear in the database - no exception is thrown and nothing shows up in the logs either.

Find the cause and fix it so that created tags are really persisted. Keep the Cycle ORM data-mapper approach and the existing package set; don't switch the storage technology.
