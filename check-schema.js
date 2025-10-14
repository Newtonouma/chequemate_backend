import pkg from "pg";
const { Client } = pkg;

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "chequemate",
  user: "postgres",
  password: "9530",
});

client
  .connect()
  .then(() =>
    client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
    )
  )
  .then((res) => {
    console.log("Users table columns:");
    res.rows.forEach((row) =>
      console.log(`- ${row.column_name}: ${row.data_type}`)
    );
    client.end();
  })
  .catch(console.error);
