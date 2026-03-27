'use strict'
require('dotenv').config()

const FILE_HEYBRO=process.env.FILE_HEYBRO
const FOLDER_SESSION=process.env.FOLDER_SESSION
const FOLDER_DATA=process.env.FOLDER_DATA
const FOLDER_WORKSPACES=process.env.FOLDER_WORKSPACES
const FOLDER_SONGS=process.env.FOLDER_SONGS
const FILE_WORKSPACES=process.env.FILE_WORKSPACES


const fs=require('fs')
const path=require('path')
const {BrowserController}=require(FILE_HEYBRO)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ctrl=null
if(!fs.existsSync(FOLDER_WORKSPACES)) fs.mkdirSync(FOLDER_WORKSPACES,{recursive:true})

async function startBrowserController(){
	if(ctrl) return
	ctrl=new BrowserController({
		backend:'puppeteer',
		browserType:'chromium'
	});
	const sessionDir=path.resolve(FOLDER_SESSION)
	if(!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir,{recursive:true})
	await ctrl.launch({userDataDir:sessionDir})
}

async function scrollToBottom(el,wait=1000){
	await ctrl.rightclickElement(el)
	await sleep(100)
	await ctrl.press('Escape')
	await sleep(100)
	await ctrl.press('Escape')
	await ctrl.press('End')
	await sleep(1000)
}

async function downloadWorkspacesIndex(){
	await startBrowserController()
	ctrl.startNetCapture()
	
	let workspaces=fs.existsSync(FILE_WORKSPACES) ? JSON.parse(fs.readFileSync(FILE_WORKSPACES,'utf8')) : {}
	let num_total_results=null
	await ctrl.goto('https://suno.com/me/workspaces')
	await sleep(1000)
	
	while(true){
		const logEntries=await ctrl.getNetLog()
		for(const entry of logEntries){
			if(entry.url.includes('/api/project/me') && entry.contentType=='application/json'){
				let buffer=null 
				while(!buffer || buffer.length<=0){
					await sleep(500)
					buffer=await ctrl.getNetBody(entry.id)
				}
				try{
					const content=JSON.parse(buffer.toString('utf-8'))
					if(!content.projects) continue
					num_total_results=content.num_total_results
					for(const project of content.projects) if(!workspaces[project.id]) workspaces[project.id]=project
					console.log(`${Object.values(workspaces).length}/${num_total_results}`)
					fs.writeFileSync(FILE_WORKSPACES,JSON.stringify(workspaces))
					if(num_total_results && Object.values(workspaces).length>=num_total_results) break
				}catch(e){}
			}
		}
		if(num_total_results && Object.values(workspaces).length>=num_total_results) break
		await scrollToBottom('.css-kidulr')
	}
	fs.writeFileSync(FILE_WORKSPACES,JSON.stringify(workspaces))
	await ctrl.stopNetCapture()
	await ctrl.clearNetLog()
	await ctrl.close()
}

downloadWorkspacesIndex()