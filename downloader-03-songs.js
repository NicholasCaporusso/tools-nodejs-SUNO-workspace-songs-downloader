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
if(!fs.existsSync(FOLDER_SONGS)) fs.mkdirSync(FOLDER_SONGS,{recursive:true})

function findFileRecursive(dir,fileName){
	const items=fs.readdirSync(dir)
	for(const item of items){
		const fullPath=path.join(dir,item)
		const stat=fs.statSync(fullPath)
		if(stat.isDirectory()){
			const result=findFileRecursive(fullPath, fileName)
			if(result) return result
		}else if(item===fileName) return fullPath
	}
	return null
}

function moveFile(sourcePath,destinationFolder){
	const fileName=path.basename(sourcePath)
	const destinationPath=path.join(destinationFolder,fileName)
	fs.renameSync(sourcePath,destinationPath)
}

async function startBrowserController(){
	if(ctrl) return
	ctrl = new BrowserController({
		backend: 'puppeteer',
		browserType: 'chromium'
	});
	const sessionDir = path.resolve(FOLDER_SESSION)
	if(!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir,{recursive:true})
	await ctrl.launch({ userDataDir: sessionDir })
}

async function downloadAllSongs(){
	await startBrowserController()
	const workspaceFiles=fs.readdirSync(FOLDER_WORKSPACES)
	//console.log(workspaceFiles)
	for(const file of workspaceFiles){
		if(file!='default.json') await downloadWorkspaceSongs(file,false)
	}
	await ctrl.close()
}

async function downloadWorkspaceSongs(file,autoclose=true){
	const workspaceName=file.replace('.json','')
	if(!fs.existsSync(`${FOLDER_SONGS}/${workspaceName}`)) fs.mkdirSync(`${FOLDER_SONGS}/${workspaceName}`,{recursive:true})
	// TODO: see if the song is in a different workspace. If so, move it
	const songs=Object.values(JSON.parse(fs.readFileSync(`${FOLDER_WORKSPACES}/${file}`,'utf8')))
	for(const song of songs){
		const foundPath=findFileRecursive(FOLDER_SONGS,`${song.id}.wav`)
		if(foundPath && !foundPath.includes(workspaceName)){
			console.log(foundPath)
			process.exit()
		}
	}
	await startBrowserController()
	for(const song of songs){
		process.stdout.write(`Processing ${workspaceName}/${song.id}.wav: `)
		if(!fs.existsSync(`${FOLDER_SONGS}/${workspaceName}/${song.id}.wav`)){
			console.log('downloading...')
			await downloadSong(workspaceName,song,false)
		}else console.log('already downloaded')
	}
	if(autoclose) await ctrl.close()
}

async function downloadSong(workspaceName,song,autoclose=true){
	await startBrowserController()
	
	await ctrl.goto(`https://suno.com/song/${song.id}`)
	await sleep(1000)
	
	await ctrl.clickElement('div.self-stretch button[aria-label="More menu contents"]')
	
	const buttons=await ctrl.queryDom('div[data-context-menu="true"] div.contents button[data-context-menu-trigger="true"]')
	for(const button of buttons){
		if(button.text.trim()=='Download') ctrl.clickElement(button.selector)
	}
	await sleep(500)
	ctrl.startNetCapture()
	
	try{
		await ctrl.clickElement('button[aria-label="WAV Audio"]')
	}catch(e){
		console.log('Failed to find the download button')
		return
	}
	
	let audioFile=null
	process.stdout.write('Waiting for audio file...')
	while(!audioFile){
		await sleep(5000)
		process.stdout.write('.')
		const logEntries=await ctrl.getNetLog()
		for(const entry of logEntries){
			if(entry.url.includes('/api/gen/') && entry.contentType=='application/json'){
				console.log('done')
				let buffer=null 
				while(!buffer || buffer.length<=0){
					await sleep(500)
					buffer=await ctrl.getNetBody(entry.id)
				}
				try{
					const content=JSON.parse(buffer.toString('utf-8'))
					if(!content.wav_file_url) continue
					console.log(`Downloading ${content.wav_file_url} into ${FOLDER_SONGS}/${workspaceName}/${song.id}.wav`)
					await ctrl.downloadUrl(content.wav_file_url,`${FOLDER_SONGS}/${workspaceName}`,`${song.id}.wav`)
					await ctrl.clearNetLog()
					await sleep(5000)
					return
				}catch(e){}
			}
		}
	}
	await ctrl.clearNetLog()
	if(autoclose) await ctrl.close()
}
downloadAllSongs()