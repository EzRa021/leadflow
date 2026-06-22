import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.warn(
    "⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY is not set. Database calls will fail.\n" +
      "   Copy .env.example to .env and fill in your Supabase project details.",
  );
}

export const supabase = createClient(url || "", key || "");
