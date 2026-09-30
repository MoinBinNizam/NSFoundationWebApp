// Runs only when the Mongo data volume is first created.
try {
  db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
} catch (error) {
  if (!String(error).includes('already initialized')) throw error;
}
