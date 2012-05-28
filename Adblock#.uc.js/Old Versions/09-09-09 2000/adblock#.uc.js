// ==UserScript==
// @name        adblock#
// @description Block ads
// @include     main
// @include     chrome://browser/content/browser.xul
// @version     09/09/09 20:00 前方一致/後方一致フィルタに対応
// @version     09/09/09 17:30 ホワイトリスト対応
// @version     09/09/09 17:10 ON,OFFができるように
// ==/UserScript==
// @version     09/08/31 10:30 高速化+メモリリーク対処
// @version     09/08/31 9:30 アスタリスクフィルターが正しく動作していなかったのを修正
// @version     09/08/30 22:00 /ads/(ADBでは*/ads/*)のようなフィルターが正規表現と解釈されていたのを修正
// @version     09/08/30 19:00 正規表現/アスタリスクを使ったフィルターに対応
// @version     09/08/29 6:00 単純文字列/アスタリスク使用フィルターに対応(正規表現/?/()を使ったものには未対応)



var adblockSharp = {

	//ブロックするサイトのURL
	// デフォルトで部分一致なので本家Adblockの「*」は不要
	// ただし、本家で「*/ads/*」のようなフィルターは正規表現との混乱を避けるため
	// そのまま */ads/* と表記する
	// 正規表現を用いるには文字列を「/」で挟む
	// アスタリスクを用いるには文字列を「+」で挟む
	// ホワイトリストを用いるには始めに「@@」をつける
	// 前方一致は先頭に、後方一致は最後に「|」をつける (ただし,フィルタは単純文字列かアスタリスクしか使用できない)
	// ()を用いる時は正規表現を用いること.
	//
	// 仕様についてはreadme.txtも参照のこと.
	// 同梱のAdblock Adblock plus用リスト変換.htmlで一応変換可能
	//   (例) 本家Adblock -> adblock#用
	//   *.hogehoge.* -> .hogehoge.
	//   */sponsor/* -> */sponsor/*
	//   http://www.testtest.com/abc/* -> http://www.testtest.com/abc/
	//   /^http:\/\/www\.(example|test|hoge)\.com\/.*/ -> /^http:\/\/www\.(example|test|hoge)\.com\/.*/ (そのまま)
	//   http://www.hogehoge.com/*.gif -> +http://www.hogehoge.com/*.gif+
	//   http://www.hogehoge.com/(ad|banner|pr).gif -> /http:\/\/www\.hogehoge\.com\/(ad|banner|pr)\.gif/
	filter: [
	],


	blackList: {},

	whiteList: {},


	enabled: true,


	init: function(){

		var black = [], white = [];


		//ON,OFFメニュー作成
		var menuPopup = document.getElementById("menu_ToolsPopup");
		var separator = document.getElementById("sanitizeSeparator");
		var menuitem = document.createElement("menuitem");
		menuitem.setAttribute("label", "Enable AdblockSharp");
		menuitem.setAttribute("type", "radio");
		menuitem.setAttribute("checked", true);
		menuitem.setAttribute("id", "adblocksharp-tool-menu");
		menuitem.addEventListener("command", function(e){
			if(adblockSharp.enabled){
				adblockSharp.enabled = false;
				this.removeAttribute("checked");
			}else{
				adblockSharp.enabled = true;
				menuitem.setAttribute("checked", true);
			}
		},false);
		menuPopup.insertBefore(menuitem, separator);


		//フィルタの仕分け
		for(let i=0; i<this.filter.length; i++){
			if($ = this.filter[i].match(/^@@(.*)$/))
				white.push($[1]);
			else
				black.push(this.filter[i]);
		}
		this.blackList = this.sortFilters(black);
		this.whiteList = this.sortFilters(white);

		Application.console.log('[Adblock] ' + this.blackList.prefixSuffixFilter);
		adblockSharpObserver.start();
	},

	uninit: function(){
		adblockSharpObserver.stop();
	},


	sortFilters: function(list){
		var filterObject = {
			plainTextFilter: [],
			regFilter: [],
			starFilter: [],
			prefixSuffixFilter: [],
		};

		for(let i=0; i<list.length; i++){
			var filter = list[i];

			//正規表現のフィルター
			if($ = filter.match(/^\/(.*)\/$/)){
				var re = new RegExp("");
				re.compile($[1]);
				filterObject.regFilter.push(re);
				continue;
			}

			//アスタリスク使用フィルター
			if($ = filter.match(/^\+(.*)\+$/)){
				var str = $[1].split('*');
				filterObject.starFilter.push(str);
				continue;
			}

			//前方一致 - なぜか正規表現ではうまくいかない
			if(filter.indexOf("|") == 0){
				filter = filter.substr(1);
				if(filter.indexOf("*") > -1){
					var str = filter.split('*');
					filterObject.prefixSuffixFilter.push([2, str]);
					continue;
				}

				filterObject.prefixSuffixFilter.push([1, filter]);
				continue;
			}

			//後方一致
			if(filter.indexOf("|") == filter.length-1){
				filter = filter.substr(0,filter.length-1);
				if(filter.indexOf("*") > -1){
					var str = filter.split('*');
					filterObject.prefixSuffixFilter.push([4, str]);
					continue;
				}

				filterObject.prefixSuffixFilter.push([3, filter]);
				continue;
			}

			//「/」 で囲まれた単純文字列フィルター
			if($ = filter.match(/^\*\/(.*)\/\*$/)){
				filterObject.plainTextFilter.push('/' + $[1] + '/');
				continue;
			}

			//単純文字列のフィルター
			filterObject.plainTextFilter.push(filter);
			continue;
		}

		return filterObject;
	},


	matchesAny: function(url, filterset){

		//単純な文字列のフィルターにマッチするかどうか : 高速
		if(filterset.plainTextFilter.length > 0){
			for(let i=0; i<filterset.plainTextFilter.length; i++){
				if(url.indexOf(filterset.plainTextFilter[i]) > -1){
					return true;
				}
			}
		}

		//アスタリスクフィルターにマッチするかどうか : 普通?
		if(filterset.starFilter.length > 0){
			for(let j=0; j<filterset.starFilter.length; j++){
				var lastMatch = -1,match;
				var isMatch = true;
				for(let i=0; i<filterset.starFilter[j].length; i++){
					match = url.indexOf(filterset.starFilter[j][i]);
					isMatch = match > lastMatch;
					if(isMatch) lastMatch = match;
					else break;
				}

				if(isMatch){
					return true;
				}
			}
		}

		//前方or後方一致フィルターにマッチするかどうか : 普通?
		if(filterset.prefixSuffixFilter.length > 0){
			for(let i=0; i<filterset.prefixSuffixFilter.length; i++){
				switch(filterset.prefixSuffixFilter[i][0]){

					//前方一致 - 単純文字列
					case 1:
						if(url.indexOf(filterset.prefixSuffixFilter[i][1]) == 0)
							return true;
						break;

					//前方一致 - アスタリスク
					case 2:
						var lastMatch = -1, match;
						var isMatch = true;
						for(let j=0; j<filterset.prefixSuffixFilter[i][1].length; j++){
							match = url.indexOf(filterset.prefixSuffixFilter[i][1][j]);
							if(j==0)
								isMatch = match == 0;
							else
								isMatch = match > lastMatch;
							if(isMatch) lastMatch = match;
							else break;
						}
		
						if(isMatch)
							return true;
						break;

					//後方一致 - 単純文字列
					case 3:
						if(url.indexOf(filterset.prefixSuffixFilter[i][1]) == url.length - filterset.prefixSuffixFilter[i][1].length)
							return true;
						break;

					//後方一致 - アスタリスク
					case 4:
						var lastMatch = -1, match;
						var isMatch = true;
						for(let j=0; j<filterset.prefixSuffixFilter[i][1].length; j++){
							match = url.indexOf(filterset.prefixSuffixFilter[i][1][j]);
							isMatch = match > lastMatch;
							if(isMatch) lastMatch = match;
							else break;
						}

						var fn = filterset.prefixSuffixFilter[i][1].length-1;
						if(isMatch && url.indexOf(filterset.prefixSuffixFilter[i][1][fn]) == url.length - filterset.prefixSuffixFilter[i][1][fn].length)
							return true;
						break;
				}
			}
		}

		//正規表現のフィルターにマッチするかどうか : 低速
		if(filterset.regFilter.length > 0){
			for(let j=0; j<filterset.regFilter.length; j++){
				if(filterset.regFilter[j].exec(url)){
					return true;
				}
			}
		}

		return false;
	}

};


var adblockSharpObserver = {
	start: function(){
		var observer = Components.classes['@mozilla.org/observer-service;1'].getService(Components.interfaces.nsIObserverService);
		observer.addObserver(adblockSharpObserver, 'http-on-modify-request', false);
	},

	stop: function(){
		var observer = Components.classes['@mozilla.org/observer-service;1'].getService(Components.interfaces.nsIObserverService);
		observer.removeObserver(adblockSharpObserver, 'http-on-modify-request');
	},

	observe: function(subject, topic, data){
		if(topic != 'http-on-modify-request') return;
		if(!adblockSharp.enabled) return;

		var http = subject.QueryInterface(Components.interfaces.nsIHttpChannel)
		http = http.QueryInterface(Components.interfaces.nsIRequest);

		var start = new Date();

		if( !adblockSharp.matchesAny(http.URI.spec, adblockSharp.whiteList) && 
			adblockSharp.matchesAny(http.URI.spec, adblockSharp.blackList)){
			http.cancel(Components.results.NS_ERROR_FAILURE);
			Application.console.log('[Adblock] BLOCK:' + http.URI.spec);
		}

		Application.console.log('[Adblock] ' + ((new Date()).getTime() - start.getTime()) + 'ms');
	}
};


adblockSharp.init();
window.addEventListener("unload", function(event){ adblockSharp.uninit(event); }, false);