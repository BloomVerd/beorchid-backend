import { Client } from 'pg';

export const createDatabase = async (dbName: string) => {
  const client = new Client({
    user: process.env.DB_USERNAME,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
  });

  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database ${dbName} created successfully`);
  } catch (error) {
    if (error.code === '42P04') {
      console.log(`Database ${dbName} already exists`);
    } else {
      console.error(`Error creating database ${dbName}:`, error);
    }
  } finally {
    await client.end();
  }
};
