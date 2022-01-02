// ==UserScript==
// @name         Garticphone DRAW bot
// @namespace    http://tampermonkey.net/
// @version      0.1
// @license      GNU
// @description  Auto drawing bot!
// @author       petmshall (peter-marshall5)

// @match        *://garticphone.com/*
// @connect      garticphone.com
// @exclude      *://garticphone.com/_next/*

// @icon         https://www.google.com/s2/favicons?domain=garticphone.com

// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_log

// @run-at       document-start
// ==/UserScript==





function requestText (url) {
  return fetch(url).then((d) => {return d.text()})
}

function requestBuffer (url) {
  return fetch(url).then((d) => {return d.arrayBuffer()})
}

let hexTable = []
for (let i = 0; i < 256; i++) {
  let hex = i.toString(16)
  if (hex.length < 2) {
    hex = '0' + hex
  }
  hexTable.push(hex)
}

function rgbToHex (r, g, b) {
  return  `#${hexTable[r]}${hexTable[g]}${hexTable[b]}`
}

const game = {
  getScale: () => {return (window.innerWidth - (window.innerWidth < 1920 ? 180 : 320)) / 1150 },
  isAnimation: () => {return Boolean(document.getElementsByClassName('note').length)}
}

Node.prototype.appendChild = new Proxy( Node.prototype.appendChild, {
    async apply (target, thisArg, [element]) {
        if (element.tagName == "SCRIPT") {
            if (element.src.indexOf('draw') != -1) {
                let text = await requestText(element.src)
                text = editScript(text)
                let blob = new Blob([text])
                element.src = URL.createObjectURL(blob)
                // console.log(element)
            }
        }
        return Reflect.apply( ...arguments );
    }
});

/* stroke configuration note */
/* [toolID, strokeID, [color, 18, 0.6], [x0, y0]. [x1, y1], ..., [xn, yn]] */

// Beware of regex spaghetti code

function editScript (text) {
    let functionFinalDraw = text.match(/function\s\w{1,}\(\w{0,}\){[^\{]+{[^\}]{0,}return\[\]\.concat\(Object\(\w{0,}\.*\w{0,}\)\(\w{0,}\),\[\w{0,}\]\)[^\}]{0,}}[^\}]{0,}}/g)[0];
    let setDataVar = functionFinalDraw.match(/\w{1,}(?=\.setData)/g)[0];
    text = text.replace(/(?<=\(\(function\(\){)(?=if\(!\w{1,}\.disabled\))/, `;window.setData = ${setDataVar}.setData;`);
    // console.log(setDataVar)
    return text;
}

let turnNum = null
let currWs = null

class customWebSocket extends WebSocket {
    constructor(...args) {
        let ws = super(...args);
        currWs = ws;
        // console.log(ws)
        ws.addEventListener('message', (e) => {
          // console.log(e.data)
            if (e.data && typeof e.data == 'string' && e.data.includes('[')) {
                let t = JSON.parse(e.data.replace(/[^\[]{0,}/, ''))[2];
                if (t?.hasOwnProperty('turnNum')) turnNum = t.turnNum;
            }
        });
        // console.log(ws)
        return ws;
    }
    send(...args) {
      if (args[0] == '2') {
        // console.log('A ping request was sent')
        // Fake pong to stop client disconnection
        // IDK if this is still necessary
        this.onmessage({data: '3'})
        // return
      }
      return super.send(...args)
    }
}
unsafeWindow.WebSocket = customWebSocket

function draw (image, fit='zoom', width=758, height=424, penSize=2) {
  console.log('[Autodraw] Drawing image')

  let canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  let ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'

  // White background
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)

  // Calculate the image position
  let imageX = 0
  let imageY = 0
  let imageWidth = width
  let imageHeight = height
  if (fit != 'stretch') {
    const imageAspectRatio = image.width / image.height
    const canvasAspectRatio = canvas.width / canvas.height
    if (fit == 'zoom') {
      if (imageAspectRatio > canvasAspectRatio) {
        imageWidth = image.width * (height / image.height)
        imageX = (width - imageWidth) / 2
      } else if (imageAspectRatio < canvasAspectRatio) {
        imageHeight = image.height * (width / image.width)
        imageY = (height - imageHeight) / 2
      }
    } else {
      if (imageAspectRatio < canvasAspectRatio) {
        imageWidth = image.width * (height / image.height)
        imageX = (width - imageWidth) / 2
      } else if (imageAspectRatio > canvasAspectRatio) {
        imageHeight = image.height * (width / image.width)
        imageY = (height - imageHeight) / 2
      }
    }
  }

  // Draw the image
  // console.log(image)
  ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight)

  let data = ctx.getImageData(0, 0, width, 424).data

  let packets = []
  let story = []

  if (game.isAnimation()) {
    // Animation gamemode
    let pos = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let color = rgbToHex(data[pos], data[pos+1], data[pos+2])
        packets.push(`42[2,7,{"t":${turnNum},"d":1,"v":[1,-1,["${color}",${penSize},${data[pos+3]/255}],[${x},${y}]]}]`)
        story.push([1, -1, [color, 2, data[3]/255], [x, y]])
        pos += 4
      }
    }
    unsafeWindow.setData((function(e){ return story })())
  } else {
    // Other gamemodes
    let dict = {}
    let pos = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // let pos = i * 4
        let color = rgbToHex(data[pos], data[pos+1], data[pos+2])
        if (!dict[color]) {
          dict[color] = `[8,-1,["${color}",${data[3]/255}],${x},${y},1,1`
        } else {
          dict[color] += ',' + x + ',' + y + ',1,1'
        }
        pos += 4
      }
    }

    for (let key in dict) {
      let stroke = `42[2,7,{"t":${turnNum},"d":1,"v":`+dict[key]+`]}]`
      story.push(JSON.parse(dict[key] + `]`))
      packets.push(stroke)
      // Free up some memory
      delete dict[key]
    }
    unsafeWindow.setData((function(e){ return story })())
  }

  // Send packets to server
  return sendPackets(packets, story)
}

function sendPackets (packets, story) {
  console.log('[Autodraw] Sending packets')
  return new Promise(function(resolve) {
    let p = 0
    let sent = 0
    let pongCount = 2
    let rateLimitActive = false
    let pongsRecieved = 0
    function pongHandler (e) {
      if (e.data == '3') {
        pongsRecieved++
        console.log('[Autodraw] Pong ' + pongsRecieved + ' / ' + pongCount)
        if (pongsRecieved >= pongCount) {
          console.log('[Autodraw] All pongs recieved')
          currWs.removeEventListener('message', pongHandler)
          resolve()
        }
      }
    }
    currWs.addEventListener('message', pongHandler)
    currWs.send('2')
    function sendChunk () {
      // Check if websocket is in OPEN state
      if (currWs.readyState != WebSocket.OPEN) {
        console.log('[Autodraw] Reconnecting')
        setTimeout(sendChunk, 200)
        return
      }

      // Only send data when nothing is buffered
      if (currWs.bufferedAmount > 0) {
        // Schedule for next javascript tick
        setTimeout(sendChunk, 0)
        return
      }

      // Ping sprinkling
      // Stops server from disconnecting
      // if (sent + packets[p].length > 4000000) {
      //   currWs.send('2')
      //   sent = 0
      //   pongCount++
      //   // console.log('Ping sprinkling')
      // }

      // Limit to 100Kb at a time
      while (currWs.bufferedAmount < 100000) {
        currWs.send(packets[p])

        sent += packets[p].length

        // Free up some memory
        delete packets[p]

        p++

        if (p >= packets.length) {
          currWs.send('2')
          // Exit if the websocket closes
          currWs.addEventListener('close', resolve)
          return
        }
      }
      setTimeout(sendChunk, 0)
    }
    sendChunk()
  })
}

let doneButton
let bottomContainer

// Fake "Done" button that shows while drawing
// Prevents submitting before all packets are sent
let fakeButton = document.createElement('button')
fakeButton.classList = 'jsx-4289504161 small'
fakeButton.disabled = true
fakeButton.style.display = 'none'
fakeButton.innerHTML = '<i class="jsx-3322258600 pencil"></i><strong>Drawing...</strong>'

function disableButton (e) {
  if (!doneButton) return e
  doneButton.style.display = 'none'
  fakeButton.style.display = ''
  return e
}

function enableButton (e) {
  if (!doneButton) return e
  doneButton.style.display = ''
  fakeButton.style.display = 'none'
  return e
}

function startDrawing () {
  if (unsafeWindow.location.href.indexOf('draw') == -1) {
   console.error('[Autodraw] You are not in the drawing section')
   return
  }
  if (!unsafeWindow.setData) {
    console.error('[Autodraw] window.setData is missing! (Injector malfunction)')
    return
  }
  pickFile()
  .then(disableButton)
  .then(createImage)
  .then((e) => {
    closeDialog()
    return e
  })
  .then(draw)
  .then(enableButton)
  .then(() => {
    console.log('[Autodraw] Done!')
    closeDialog()
  })
}

function pickFile () {
  return new Promise(function(resolve) {
    let picker = document.createElement('input')
    picker.type = 'file'
    picker.click()
    picker.oninput = function() {
      resolve(URL.createObjectURL(picker.files[0]))
    }
  })
}

function createImage (url) {
  console.log('[Autodraw] Loading image')
  return new Promise(function(resolve) {
    let image = document.createElement('img')
    image.onload = function() {
      console.log('[Autodraw] Image loaded')
      resolve(image)
    }
    image.src = url
  })
}

function injectUI () {
  // Get the side menu container
  const sideMenu = document.querySelector('.jsx-2643802174.tools > .jsx-2643802174')
  if (!sideMenu) {
    return
  }
  if (sideMenu.childElementCount > 10) {
    return
  }
  sideMenu.style.height = 'unset'

  doneButton = document.querySelector('button.jsx-4289504161.small')
  bottomContainer = document.querySelector('.jsx-2849961842.bottom')

  // Add the fake button
  bottomContainer.appendChild(fakeButton)

  // Create the "Add image" button
  const addImageButton = document.createElement('div')
  addImageButton.classList = 'jsx-2643802174 tool image'
  addImageButton.style.margin = '6px 0 1px 0'
  addImageButton.style.backgroundSize = '100%'
  addImageButton.style.color = '#d16283'

  // Add style
  const style = document.createElement('style')
  style.innerText = `.jsx-2643802174.tool.image::after {
    content: "+";
    margin: 2px;
    flex: 1 1 0%;
    border-radius: 3px;
    align-self: stretch;
    font: 60px Black;
    transform: translate(0px, -20px);
  }`
  document.head.appendChild(style)
  sideMenu.appendChild(addImageButton)

  // Click handler
  addImageButton.onclick = openDialog
}

function openDialog () {
  container.style.display = 'flex'
  setTimeout(() => {
    container.style.opacity = '1'
  }, 0)
}

function closeDialog () {
  container.style.opacity = '0'
  setTimeout(() => {
    container.style.display = 'none'
  }, 200)
}

// Create the UI
const container = document.createElement('div')
container.style.width = '100%'
container.style.height = '100%'
container.style.position = 'absolute'
container.style.top = '0px'
container.style.left = '0px'
container.style.background = 'rgba(0,0,0,0.8)'
container.style.justifyContent = 'center'
container.style.alignItems = 'center'
container.style.display = 'none' // Set to "flex" to show
container.style.opacity = 0
container.style.zIndex = '5'
container.classList = 'autodraw-container'
const modal = document.createElement('div')
modal.style.width = '60%'
modal.style.height = '60%'
modal.style.background = 'white'
modal.style.padding = '25px 30px'
modal.style.borderRadius = '12px'
modal.style.display = 'flex'
modal.style.flexDirection = 'column'
modal.style.alignItems = 'center'
modal.style.fontFamily = 'Black'
container.appendChild(modal)
const closeButton = document.createElement('div')
closeButton.innerText = '' // "X" symbol
closeButton.style.fontFamily = 'ico' // Icon font
closeButton.style.fontSize = '24px'
closeButton.style.color = 'black'
closeButton.style.textAlign = 'right'
closeButton.style.margin = '0 0 0 100%'
closeButton.style.lineHeight = '5px' // Center in corner
closeButton.style.textTransform = 'uppercase'
closeButton.style.height = '0px' // Don't offset the next line
closeButton.style.cursor = 'pointer'
closeButton.onclick = closeDialog
modal.appendChild(closeButton)
const title = document.createElement('h2')
title.classList = 'jsx-143026286'
title.innerText = 'Insert Image'
title.style.fontFamily = 'Black'
title.style.fontSize = '24px'
title.style.color = 'rgb(48, 26, 107)'
title.style.textAlign = 'center'
title.style.lineHeight = '29px'
title.style.textTransform = 'uppercase'
title.style.display = 'flex'
title.style.flexDirection = 'row'
modal.appendChild(title)
const dropArea = document.createElement('div')
dropArea.style.width = '100%'
dropArea.style.height = '100%'
dropArea.style.alignItems = 'center'
dropArea.style.display = 'flex'
dropArea.style.justifyContent = 'center'
dropArea.style.border = '4px dashed gray'
dropArea.style.borderRadius = '17px'
dropArea.style.cursor = 'pointer'
// dropArea.style.margin = '0 0 10px'
dropArea.innerText = 'Drag and drop images here or click to choose a file'
dropArea.onclick = startDrawing
modal.appendChild(dropArea)
const bottomDiv = document.createElement('div')
bottomDiv.style.width = '100%'
bottomDiv.style.display = 'flex'
bottomDiv.style.flexDirection = 'row'
bottomDiv.style.margin = '20px 0 0'
modal.appendChild(bottomDiv)
const urlInput = document.createElement('input')
urlInput.style.width = '100%'
urlInput.style.height = '34px'
urlInput.style.border = '4px solid black'
urlInput.style.borderRadius = '7px'
urlInput.style.fontFamily = 'Bold'
urlInput.style.fontSize = '19px'
urlInput.style.padding = '0 10px'
urlInput.placeholder = 'URL'
bottomDiv.appendChild(urlInput)
const insertButton = document.createElement('button')
insertButton.classList = 'insert-button'
insertButton.innerText = 'LOAD URL'
bottomDiv.appendChild(insertButton)
const uiStyle = document.createElement('style')
uiStyle.innerText = `
.insert-button:hover {
  background-color: rgb(64, 32, 194);
}
.insert-button {
  margin: 0px 8px;
  cursor: pointer;
  border: none;
  background-color: rgb(86, 53, 220);
  border-radius: 7px;
  width: 160px;
  height: 42px;
  font-family: Black;
  font-size: 17px;
  color: rgb(255, 255, 255);
  text-align: center;
  text-transform: uppercase;
}
.autodraw-container {
  transition: opacity linear 0.2s;
}`

unsafeWindow.startDrawing = startDrawing
document.addEventListener('DOMContentLoaded', () => {
  setInterval(injectUI, 300)

  // Add UI
  document.body.appendChild(container)
  document.head.appendChild(uiStyle)
})
