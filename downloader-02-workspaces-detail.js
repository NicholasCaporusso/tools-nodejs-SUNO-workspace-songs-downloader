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

const workspaces=fs.existsSync(FILE_WORKSPACES) ? JSON.parse(fs.readFileSync(FILE_WORKSPACES,'utf8')) : {}
if(Object.keys(workspaces).length==0){
	console.log(`No workspaces found in ${FILE_WORKSPACES}`)
	process.exit()
}
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

async function downloadWorkspaceIndex(){
	await startBrowserController()
	const workspaceItems=Object.values(workspaces)
	console.log(`${workspaceItems.length} workspaces found.`)
	for(const workspace of workspaceItems) await downloadWorkspacesDetail(workspace,false)
	await ctrl.close()
}

async function downloadWorkspacesDetail(workspace,autoclose=true){
	await startBrowserController()
	const file_workspace=`${FOLDER_WORKSPACES}/${workspace.id}.json`
	const songs=fs.existsSync(file_workspace) ? JSON.parse(fs.readFileSync(file_workspace,'utf8')) : {}
	
	// Check if workspace matches title
	let title=''
	do{
		if(ctrl.listTabs().length>1) await ctrl.closeTab()
		await ctrl.openTab(`https://suno.com/create?wid=${workspace.id}`)
		ctrl.startNetCapture()
		await sleep(3000)
		title=await ctrl.getDomText('#main-container .line-clamp-1')
	}while(title!=workspace.name)

	while(Object.keys(songs).length!=workspace.clip_count){
		const logEntries=ctrl.getNetLog()
		for(const entry of logEntries){
			if(entry.url.includes('/api/feed/v3') && entry.contentType=='application/json'){
				let buffer=null
				while(!buffer || buffer.length<=0){
					await sleep(500)
					buffer=ctrl.getNetBody(entry.id)
				}
				try{
					const content=JSON.parse(buffer.toString('utf-8'))
					if(!content.clips) continue
					for(const clip of content.clips){
						if(workspace.id!='default' && clip.project.id!=workspace.id) continue
						if(!songs[clip.id]) songs[clip.id]=clip
					}
					console.log(`Workspace ${workspace.id}: ${Object.keys(songs).length}/${workspace.clip_count}`)
					if(Object.keys(songs).length==workspace.clip_count) break
				}catch(e){}
			}
		}
		console.log(`Workspace ${workspace.id}: ${Object.keys(songs).length}/${workspace.clip_count}`)
		fs.writeFileSync(file_workspace,JSON.stringify(songs))
		if(Object.keys(songs).length==workspace.clip_count) break
		try{
			await scrollToBottom('.clip-browser-list-scroller')
		}catch(e){
			console.log(e)
		}
	}
	ctrl.stopNetCapture()
	await ctrl.closeTab()
	if(autoclose) await ctrl.close()
}

downloadWorkspaceIndex()