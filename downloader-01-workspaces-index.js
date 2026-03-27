'use strict'
require('dotenv').config()

// Load environment variables for paths and HeyBro module
const FILE_HEYBRO=process.env.FILE_HEYBRO
const FOLDER_SESSION=process.env.FOLDER_SESSION
const FOLDER_DATA=process.env.FOLDER_DATA
const FOLDER_WORKSPACES=process.env.FOLDER_WORKSPACES
const FOLDER_SONGS=process.env.FOLDER_SONGS
const FILE_WORKSPACES=process.env.FILE_WORKSPACES


const fs=require('fs')
const path=require('path')
// Import the BrowserController from the HeyBro extension for web automation and interception
const {BrowserController}=require(FILE_HEYBRO)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

let ctrl=null
// Ensure the workspaces directory exists before attempting to write there
if(!fs.existsSync(FOLDER_WORKSPACES)) fs.mkdirSync(FOLDER_WORKSPACES,{recursive:true})

// Initializes the Puppeteer-based Chromium browser via HeyBro
async function startBrowserController(){
	if(ctrl) return
	ctrl=new BrowserController({
		backend:'puppeteer',
		browserType:'chromium'
	});
	const sessionDir=path.resolve(FOLDER_SESSION)
	if(!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir,{recursive:true})
	// Launch browser utilizing the designated user data directory to retain the logged-in user session
	await ctrl.launch({userDataDir:sessionDir})
}

// Simulates user scrolling to load more elements in infinite-scroll interfaces
async function scrollToBottom(el,wait=1000){
	await ctrl.rightclickElement(el)
	await sleep(100)
	await ctrl.press('Escape')
	await sleep(100)
	await ctrl.press('Escape')
	await ctrl.press('End') // Press 'End' to scroll to the very bottom of the page
	await sleep(1000)
}

// Main function to fetch all workspaces (the index) from Suno
async function downloadWorkspacesIndex(){
	await startBrowserController()
	// Start capturing network requests to intercept XHR/Fetch API calls
	ctrl.startNetCapture()
	
	// Load existing workspaces from file, or initialize an empty dictionary
	let workspaces={}
	let num_total_results=null
	
	// Navigate directly to the user's workspaces overview page
	await ctrl.goto('https://suno.com/me/workspaces')
	await sleep(1000)
	
	while(true){
		// Retrieve all network requests captured thus far
		const logEntries=await ctrl.getNetLog()
		for(const entry of logEntries){
			// Look for the specific API response containing project/workspace data payloads
			if(entry.url.includes('/api/project/me') && entry.contentType=='application/json'){
				let buffer=null 
				// Wait until the response body bytes have been completely received
				while(!buffer || buffer.length<=0){
					await sleep(500)
					buffer=await ctrl.getNetBody(entry.id)
				}
				try{
					// Parse the JSON payload returned by the API
					const content=JSON.parse(buffer.toString('utf-8'))
					if(!content.projects) continue
					num_total_results=content.num_total_results
					
					// Merge newly discovered workspaces into the local dictionary based on their ID
					for(const project of content.projects) if(!workspaces[project.id]) workspaces[project.id]=project
					console.log(`${Object.values(workspaces).length}/${num_total_results}`)
					
					// Save the current progress to data/workspaces.json periodically
					fs.writeFileSync(FILE_WORKSPACES,JSON.stringify(workspaces))
					
					// Break loop condition if we have successfully parsed all expected workspaces
					if(num_total_results && Object.values(workspaces).length>=num_total_results) break
				}catch(e){}
			}
		}
		// Double-check the break condition in the outer loop
		if(num_total_results && Object.values(workspaces).length>=num_total_results) break
		
		// Scroll the page to trigger the next API pagination request
		await scrollToBottom('.css-kidulr')
	}
	
	// Final commit to file and cleanup browser resources
	fs.writeFileSync(FILE_WORKSPACES,JSON.stringify(workspaces))
	await ctrl.stopNetCapture()
	await ctrl.clearNetLog()
	await ctrl.close()
}

// Execute the download logic
if(require.main === module) downloadWorkspacesIndex()

module.exports = { downloadWorkspacesIndex }