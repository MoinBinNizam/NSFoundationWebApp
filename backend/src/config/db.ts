import mongoose from 'mongoose';

/**
 * Connects to MongoDB using the MONGODB_URI environment variable.
 * Fails immediately and clearly if the URI is missing.
 * Does NOT implement business logic, seed data, or balance manipulation.
 */
export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not defined in environment variables. ' +
        'Copy backend/.env.example to backend/.env and set a valid connection string.'
    );
  }

  await mongoose.connect(uri, {
    // Connection pool options suitable for production
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
}

/**
 * Returns the current Mongoose connection readyState as a human-readable string.
 * States: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
 */
export function getDatabaseStatus(): string {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'unknown';
}
