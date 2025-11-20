const sql = require('mssql');
const config = {
  server: process.env.SQL_SERVER,      // 'localhost'
  database: process.env.SQL_DB,        // 'HotelAlejandroI'
  user: process.env.SQL_USER,          // 'miapp_user' o 'sa'
  password: process.env.SQL_PASS,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.SQL_INSTANCE // 'SQLEXPRESS'
  }
};
let pool;
async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server');
  }
  return pool;
}
module.exports = { sql, getPool };
