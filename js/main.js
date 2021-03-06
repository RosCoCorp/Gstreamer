// Author: Roy Ros Cobo

var localVideo = document.getElementById("localVideo");
var remoteVideos = [document.getElementById("remoteVideo"),
                    document.getElementById("remoteVideo2"),
                    document.getElementById("remoteVideo3")];

var startButton = document.getElementById("startButton");
var signButton = document.getElementById("signButton");
var negotiateButton = document.getElementById("negotiateButton");

startButton.onclick = start;
signButton.onclick = connectSignServer;
negotiateButton.onclick = function(){ negotiate(0,0); };


///////// Constants /////////////////////////
const GST_SERVER_ID = 0;
const BROADCAST=-2;

const web_socket_sign_url = 'wss://'+window.location.host;

const configuration = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

//////// Variables //////////////////////////////////////////////////
var gstServerON = false;
var localID;
var localStream, pcs = [], wss; 


//////////// Media ///////////////////////////////////////////////////////////////////////////////////////////////

function start() {

  startButton.disabled = true;
  
  createPeerConnection(0, GST_SERVER_ID);

  if(document.getElementById('selTest').checked){

    var rndStream = Math.floor((Math.random() * 4) + 1);
    if(rndStream == 1)localVideo.setAttribute('src', "videoTests/smpte.mp4");
    else if(rndStream == 2) localVideo.setAttribute('src', "videoTests/ball.mp4");
    else localVideo.setAttribute('src', "videoTests/human.mp4");

    localVideo.setAttribute('type',"video/mp4");
    localVideo.play().then(function(){

      localStream = localVideo.captureStream();

      localStream.getTracks().forEach(track => pcs[0].addTrack(track, localStream));

    });


  }else navigator.mediaDevices.getUserMedia({video: true, audio: false}).then(function(stream){ 

	    console.log("Requesting local media");
	    localStream = stream;

	    localVideo.srcObject = localStream;
      localVideo.play();

	    localStream.getTracks().forEach(track => pcs[0].addTrack(track, localStream));
	  });

  signButton.disabled = false;
}

function negotiate(index, to){

  if(localID==undefined) console.log("ID not defined!");
  else{

    negotiateButton.disabled = true;

    pcs[index].createOffer().then(function(description){

      console.log('Setting local description');
      pcs[index].setLocalDescription(description);

      console.log("%c>>>", 'color: red'," negotiating, sending offer:"); console.log(description);
      wss.send(JSON.stringify({type:"offer", data:description, from:localID, to:to, index:index}));
    });
  }
}


function connectSignServer(){

  signButton.disabled = true;

  console.log("Connecting to the signalling server");
  wss = new WebSocket(web_socket_sign_url);

  wss.onmessage = function(msg){

    var data = JSON.parse(msg.data);

    //console.log("------------------------------------------");
    console.log("%c<<< ", 'color: green', "Type:"+data.type+" from:"+data.from+" to:"+data.to+" index:"+data.index);

    if(data.type=="txt") console.log(data.data);
    else if(data.type=="id"){

      localID = data.data;
      document.getElementById("id").innerHTML = "ID: "+localID;

      console.log('%c My id is:'+localID+' ', 'background: black; color: white');

    }else if(data.type=="gstServerON"){

      gstServerON = true;
      negotiateButton.disabled = false;

      console.log(data.data);
    }else if(data.type=="socketON"){

      console.log("^^^ New conected "+data.data.id+" = "+data.data.ip);

    }else if(data.type=="socketOFF"){

      console.log("vvv Disconnected "+data.data.id+" = "+data.data.ip);

    }else if(data.type=="offer"){

      console.log('<<< OFFER '+data.index+' received:'); console.log(data.data);


      if(data.index > 0) createPeerConnection(data.index, data.from);

      if(data.from > 0) localStream.getTracks().forEach(track => pcs[data.index].addTrack(track, localStream));


      pcs[data.index].setRemoteDescription(new RTCSessionDescription(data.data));

      pcs[data.index].createAnswer().then(function(description){

        pcs[data.index].setLocalDescription(description);

        console.log('%c>>>', 'color: red','Sending answer '+data.index+':'); console.log(description);
        wss.send(JSON.stringify({type:"answer", data:description, from:localID, to:data.from, index:data.index}));
      });

    }else if(data.type=="answer"){

      console.log("<<< ANSWER received:"); console.log(data.data);

      pcs[data.index].setRemoteDescription(new RTCSessionDescription(data.data));

    }else if(data.type=="candidate"){

      //console.log(data.data);

      pcs[data.index].addIceCandidate(new RTCIceCandidate(data.data));

    }else if(data.type=="negotiate"){
      console.log("Maybe negotiate for"+data.data)

      if(data.data != localID){

        var newIndex = pcs.length;
        var negoWith = data.data;

        createPeerConnection(newIndex, negoWith);
        localStream.getTracks().forEach(track => pcs[newIndex].addTrack(track, localStream));

        negotiate(newIndex, negoWith);

      }
    }else{ console.log("Type ERROR: "); console.log(data); } 
  }


  wss.onclose = function(){

    document.getElementById("id").innerHTML = "ID: undefined";
    localID = undefined;

    startButton.disabled = false;
    negotiateButton.disabled = true;

    wss.close();

    console.log("Sign server disconnected!");
  }

  negotiateButton.disabled = true;
}

function createPeerConnection(index, to){

  console.log('Creating peer connection '+index);
  pcs[index] = new RTCPeerConnection();


  pcs[index].onicecandidate = function(ev){

    if (ev.candidate){ 

      console.log("Sending candidate: "+index); console.log(ev.candidate);
      wss.send(JSON.stringify({type:"candidate", data:ev.candidate, from: localID, to:to, index:index}));
    }
  }

  pcs[index].ontrack = function(ev){

    remoteVideos[index].srcObject = ev.streams[0];

    if(index > 0){

      document.getElementById('sineVideo'+index).innerHTML = "Remote video: "+index;
      remoteVideos[index].style.display = "initial";
    }

    negotiateButton.disabled = true;
  }
}



/////////// Send text //////////////////////////////////
document.getElementById('formSend').addEventListener('submit', function(e){e.preventDefault();
      
  var input = document.getElementById('inputSend');

  var txt = input.value;

  if(localID!=undefined && txt!=""){

    input.value = '';

    var isTxt = txt[0]!="{";


    if(isTxt){ 

      var to = BROADCAST;

      if(!isNaN(txt[0])) { to=txt[0]; txt = txt.substring(1,txt.length); }

      console.log('%c>>>', 'color: red','Type:txt from:'+localID+' to:'+to); 
      console.log(txt);
      
      wss.send(JSON.stringify({type:"txt", data:txt, from:localID, to:to })); 

    }else{

      var data = JSON.parse(txt);

      console.log('%c>>>', 'color: red','Type:'+data.type+' from:'+data.from+' to:'+data.to+' index:'+data.index); 
      console.log(data.data);
      
      wss.send(txt);
    }
  }else console.log("ERROR sending message");
});
