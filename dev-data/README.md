# Development Data

This folder contains sample data for development and testing purposes.

## Files

- `import-data.js` - Script to import or delete development data
- `users.json` - Sample user data
- `exercises.json` - Sample exercise data
- `exerciseSessions.json` - Sample exercise session data (requires User and Exercise IDs)
- `feedbacks.json` - Sample feedback data (requires Session IDs)
- `poseData.json` - Sample pose data (requires Session IDs)

## Usage

### Import Data

To import all development data into your database:

```bash
node dev-data/import-data.js --import
```

### Delete Data

To delete all development data from your database:

```bash
node dev-data/import-data.js --delete
```

## Important Notes

1. **Automatic Relationship Handling**: The import script automatically handles foreign key relationships:
   - Imports Users first and stores their IDs
   - Imports Exercises and stores their IDs
   - Replaces placeholders (`{{USER_ID_1}}`, `{{EXERCISE_ID_1}}`) in ExerciseSessions with actual IDs
   - Imports ExerciseSessions and stores their IDs
   - Replaces placeholders (`{{SESSION_ID_1}}`) in Feedbacks and PoseData with actual Session IDs
   - Imports Feedbacks and PoseData

2. **Placeholder Values**: The JSON files use placeholders like `{{USER_ID_1}}`, `{{EXERCISE_ID_1}}`, and `{{SESSION_ID_1}}`. These are automatically replaced during import. You can add more entries to the JSON files using the same placeholder pattern.

3. **Password Hashing**: User passwords in `users.json` are plain text. The User model will automatically hash them using bcrypt when saving.

4. **Environment Variables**: Make sure your `config.env` file is properly configured with:
   - `DATABASE` - MongoDB connection string
   - `DATABASE_PASSWORD` - Database password (if using connection string with `<PASSWORD>` placeholder)

5. **Import Order**: Data is imported in the following order to maintain referential integrity:
   - Users → Exercises → ExerciseSessions → Feedbacks → PoseData

6. **Delete Order**: Data is deleted in reverse order to maintain referential integrity:
   - PoseData → Feedbacks → ExerciseSessions → Exercises → Users

## Customization

You can modify the JSON files to add more sample data or adjust the existing data to match your testing needs.

