// ==UserScript==
// @name         SecretEnqueteChecker.uc.js
// @description  コッソリアンケートの新着を定期的に確認する
// @include      main
// @author       nodaguti
// @license      MIT License
// @version      2012/10/07 14:00 first release
// @note         事前にブラウザでログインしておく必要あり
// ==/UserScript==


(function(){

// ---- config ----

//チェックする間隔 [ms]
const INTERVAL = 30 * 1000;

//起動時にチェックするかどうか [true]/false
const CHECK_ON_RUN = true;


//=回答可能なアンケがあった時の挙動
//ビープ音を鳴らす [true]/false
const PLAY_BEEP = true;

//アラートで知らせる [true]/false
const NOTIFY_ALERT = true;

//コンソールに表示する true/[false]
const NOTIFY_LOG = false;

// ---- /config ----


const { Cc: classes, Ci: interfaces, Cu: utils, Cr: results } = Components;

var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
var as = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

var FLAG_HAVE_TIMER = false;


function U(octets){
	return decodeURIComponent(escape(octets));
}

function log(){
	var args = Array.slice(arguments);
	args.unshift('[SecretEnqChecker]');
	
	Application.console.log(args.join(' '));
}


function init(force){
	var enumerator = wm.getEnumerator('navigator:browser');
	
	//すでにスタートしていたら何もしない
	for(var i=0;enumerator.hasMoreElements();enumerator.getNext(i++));

	if(i < 2 || force){
		if(CHECK_ON_RUN) load();
		
		timer.initWithCallback({ notify: load }, INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);
		
		log('Start the timer');
		FLAG_HAVE_TIMER = true;
	}
}

function uninit(){
	window.removeEventListener('unload', arguments.callee, false);
	
	if(FLAG_HAVE_TIMER){
		log('Cancel the timer');
		timer.cancel();
		
		var enumerator = wm.getEnumerator('navigator:browser');
		var otherWindow = wm.getMostRecentWindow("navigator:browser");
	
		if(enumerator.hasMoreElements() && otherWindow && otherWindow.SecretEnqChecker){
			otherWindow.SecretEnqChecker.init(true);
		}
	}
}


function load(){
	const url = "http://find.2ch.net/enq/answer_index.php?ONLYQ=t&.rand=" + Math.floor(Math.random() * 10000);
	
	req.open("GET", url, true);

	req.onload = check;
	req.onerror = error;
	
	req.setRequestHeader("Cache-Control", "no-cache");
	req.overrideMimeType("text/html; charset=euc-jp");

	try {
		req.send(null);
	}catch(e){
		error(e);
	}
}

function check(){
	if(req.readyState == 4 && req.status == 200){
		var text = req.responseText;
		
		if(text.indexOf('<input type=submit name=BUTTON', 3700) > -1){
			//一覧作成
			var enqNames = text.match(/<div\s+class="tight"><a\s+name="\d+">#\d+<\/a>:\s+.*?<\/div>/g).map(function(item, index){
				return (index + 1) + ': ' + 
						item.replace(/<div\s+class="tight"><a\s+name="\d+">#\d+<\/a>:\s/, '')
							.replace(/<\/div>/, '');
			});
			
			//notify
			if(PLAY_BEEP) Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound).beep();
			if(NOTIFY_ALERT) as.showAlertNotification('', U('コソアンチェッカー'), U('回答可能なアンケ一覧\n\n') + enqNames.join('\n'));
			if(NOTIFY_LOG) log(('回答可能なアンケ一覧\n\n') + enqNames.join('\n'));
		}else{
			//log('No Enquete.');
		}
		
	}
}

function error(e){
	log('[ERROR]', e);
}


init();
window.addEventListener('unload', uninit, false);


//initだけ外部に公開
if(window.SecretEnqChecker)
	delete window.SecretEnqChecker;
	
window.SecretEnqChecker = {};
window.SecretEnqChecker.init = init;
})();