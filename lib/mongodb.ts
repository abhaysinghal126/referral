import { MongoClient } from 'mongodb';

declare global {
  // allow global cached var in dev to preserve a single client
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<any> | undefined;
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Please define the MONGODB_URI environment variable inside .env');

const options = {} as any;

let client: any;
let clientPromise: Promise<any>;

if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global.__mongoClientPromise) {
    client = new MongoClient(uri, options);
    global.__mongoClientPromise = client.connect();
  }
  // global.__mongoClientPromise is typed as possibly undefined above, but we ensured
  // it's set in the conditional. Use a cast to satisfy the compiler.
  clientPromise = global.__mongoClientPromise as Promise<any>;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
