// Compatibility entry point: the application mounts this router through server/app.js.
// Reuse the validated menu, authenticated history and response contract.
const { chatRouter } = require('../server/chat');
const { createClient } = require('@supabase/supabase-js');
module.exports = chatRouter(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, createClient, process.env);
