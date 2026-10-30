import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4175','--strictPort'],{stdio:'inherit',windowsHide:true,env:{...process.env,VITE_SUPABASE_URL:'https://book-year-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_only_not_a_real_key'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{child.kill();process.exit();});
child.on('exit',code=>process.exit(code??0));
