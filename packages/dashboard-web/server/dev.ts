// Load environment variables BEFORE any other imports
import { loadServerEnv } from "./env";
loadServerEnv();

// Now import the real server (all env vars are loaded)
import "./index";
