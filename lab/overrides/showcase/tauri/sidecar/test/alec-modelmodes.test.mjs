// ALEC LAB: testes independentes de modo conversa. Sem acesso a credenciais ou pastas reais.
import assert from 'node:assert/strict';
import { conversationOnly, capabilityLabel, conversationPrompt } from '../alec-modelmode.mjs';
const all = { supportsTools:true, supportsImages:true };
const text = { supportsTools:false, supportsImages:false };
const toolsText = { supportsTools:true, supportsImages:false };
const visionNoTools = { supportsTools:false, supportsImages:true };
assert.equal(conversationOnly('local', all), false);
for(const m of [text,toolsText,visionNoTools]) assert.equal(conversationOnly('local',m),true);
assert.equal(conversationOnly('openai',text),false);
assert.match(capabilityLabel(all),/Visão/);
assert.match(capabilityLabel(text),/Só texto/);
const prompt=conversationPrompt({name:'ALEC',user:'Pessoa',facts:[{text:'Prefere português'}]});
assert.match(prompt,/não tens acesso a ferramentas/);
assert.match(prompt,/Prefere português/);
assert.doesNotMatch(prompt,/podes abrir aplicações/i);
console.log('alec-modelmodes: ok');
