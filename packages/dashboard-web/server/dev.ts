import dotenv from "dotenv";

// load env FIRST
dotenv.config({ path: ".env.local" });


// now import the real server
import "./index";
