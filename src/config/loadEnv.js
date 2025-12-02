/**
 * Environment Configuration Loader
 * This file must be imported FIRST before any other imports that depend on environment variables
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from config.env
dotenv.config({ path: path.join(__dirname, "../../config.env") });

export default {};
