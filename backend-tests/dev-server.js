// Test fixture only. Production server always requires Supabase.
const {createApp}=require('../backend/server');const {MemoryRepository}=require('./helpers');
const repository=new MemoryRepository();
createApp({repository,username:'test',password:'test-only-password-123456789'}).listen(4320,'0.0.0.0',()=>console.log('Test server ready'));
