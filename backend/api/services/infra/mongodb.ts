import mongoose from "mongoose";

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }
  return uri;
}

mongoose.set("bufferCommands", false);

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

export async function connectDB() {
  const MONGODB_URI = requireMongoUri();

  if (cached.conn?.connection?.readyState === 1) {
    return cached.conn;
  }

  // Drop stale socket after Mongo container restart (e.g. npm run reset:db).
  cached.conn = null;
  cached.promise = null;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10_000,
      })
      .then((conn) => {
        conn.connection.on("disconnected", () => {
          cached.conn = null;
          cached.promise = null;
        });
        return conn;
      })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
