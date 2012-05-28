// ==UserScript==
// @name        adblock#.uc.js
// @description Block Ads
// @include     main
// @include     chrome://browser/content/browser.xul
// @author      nodaguti
// @version     10/12/31 22:00 結果が正しく保存されないバグを修正
// ==/UserScript==
// @version     10/12/30 18:30 adblock#.uc.js Filter Manager を実装
// @version     10/05/21 21:30 正規表現フィルタのマッチ処理を高速化
// @version     10/05/21 20:40 アスタリスクフィルタを+無しでも機能するようにした
// @version     10/05/21 20:30 マッチング処理を15%程度高速化
// @version     09/09/15 19:30 typo
// @version     09/09/14 18:00 ちょこっと高速化
// @version     09/09/09 20:00 前方一致/後方一致フィルタに対応
// @version     09/09/09 17:30 ホワイトリスト対応
// @version     09/09/09 17:10 ON,OFFができるように
// @version     09/08/31 10:30 高速化+メモリリーク対処
// @version     09/08/31 9:30 アスタリスクフィルターが正しく動作していなかったのを修正
// @version     09/08/30 22:00 /ads/(ADBでは*/ads/*)のようなフィルターが正規表現と解釈されていたのを修正
// @version     09/08/30 19:00 正規表現/アスタリスクを使ったフィルターに対応
// @version     09/08/29 6:00 単純文字列/アスタリスク使用フィルターに対応(正規表現/?/()を使ったものには未対応)



var adblockSharp = {

	/* ----- config ----- */

	//アスタリスクフィルタを,「+」なしで利用できるようにするか true/[false]
	starfilterWithoutPlus: false,

	//強制的に下のfilter:から読み込む true/[false]
	forceLoadFromScript: false,

	//ブロックするサイトのURL
	// デフォルトで部分一致
	// 正規表現を用いるには文字列を「/」で挟む
	// アスタリスクを用いるには文字列を「+」で挟む
	// ホワイトリストを用いるには始めに「@@」をつける
	// 前方一致は先頭に、後方一致は最後に「|」をつける (ただし,フィルタは単純文字列かアスタリスクしか使用できない)
	// ()を用いる時は正規表現を用いること.
	// 完全一致させたい場合は正規表現を用いること.
	//
	// 仕様についてはReadMe.txtも参照のこと.
	// Adblock系のフィルタを同梱のAdblock Adblock plus用リスト変換.htmlで一応変換可能
	//
	// 10/12/30版より, 原則として Global Storageを使うようになり, filter: からは読み込まないようになった.
	// 詳しくは ReadMe.txt 参照.
	//
	//   [フィルタ例]
	//     (単純文字列) http://hogehoge.com/
	//     (アスタリスク) +http://hoge.*.com/+
	//     (前方一致) |http://hogehoge.com/
	//     (後方一致) example.swf|
	//     (正規表現) /^http:\/\/www\.hogehoge\.com\/\d+/
	//     (ホワイトリスト) @@htto://www.google.com/
	filter: [
//      以下のように「'」または「"」でフィルタを括り,最後に「,」を付加してフィルタを追加.
//      'http://hogehoge.com/',
	],


	// -------------------------------
	//   ここより下は編集しないで下さい
	// -------------------------------


	enabled: true,

	init: function(){

		//メニュー作成
		var menuPopup = document.getElementById("menu_ToolsPopup");
		var separator = document.getElementById("sanitizeSeparator");
		var menuitem = document.createElement("menuitem");
		menuitem.setAttribute("label", "Enable Adblock#.uc.js");
		menuitem.setAttribute("type", "radio");
		menuitem.setAttribute("checked", true);
		menuitem.setAttribute("id", "adblocksharp-tool-menu-enabled");
		menuitem.addEventListener("command", function(e){
			if(adblockSharp.enabled){
				adblockSharp.enabled = false;
				this.removeAttribute("checked");
			}else{
				adblockSharp.enabled = true;
				menuitem.setAttribute("checked", true);
			}
		}, false);
		menuPopup.insertBefore(menuitem, separator);

		var menuitem2 = document.createElement('menuitem');
		menuitem2.setAttribute("label", "Organize adblock#.uc.js Filter...");
		menuitem2.setAttribute("id", "adblocksharp-tool-menu-manager");
		menuitem2.addEventListener("command", function(){
			adblockSharp.filterManager.showManager();
		}, false);
		menuPopup.insertBefore(menuitem2, separator);


		this.filterManager.init();
		this.observer.start();
	},

	uninit: function(){
		this.filterManager.uninit();
		this.observer.stop();
	},

	debug: function(mes){
		if(!this._console){
			this._console = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
		}

		this._console.logStringMessage("[Adblock#] " + mes);
	}
};


adblockSharp.filterManager = {

	init: function(){
		if(!this.storage){
			this.storage = {};
			this.storage['filter'] = window.globalStorage['adblockSharp.filter'];
			this.storage['result'] = window.globalStorage['adblockSharp.result'];
		}

		this.JSON = Components.classes["@mozilla.org/dom/json;1"].createInstance(Components.interfaces.nsIJSON);

		try{
			if(adblockSharp.forceLoadFromScript) throw('forceLoadFromScript is true');
			this.blackList = this.JSON.decode(this.storage['filter'].getItem('blackList').value);
		}catch(e){
			adblockSharp.debug('Error is occurred when loading blackList, so build-in filters (filter:) is used instead. (' + e + ')');
			this.blackList = {
				plainTextFilter: [],
				regFilter: [],
				starFilter: [],
				prefixSuffixFilter: [],
			};
			adblockSharp.filter.forEach(function(element){
				if(element.indexOf('@@') !== 0) adblockSharp.filterManager.sortFilter(element, this);
			}, this.blackList);
		}

		try{
			if(adblockSharp.forceLoadFromScript) throw('forceLoadFromScript is true');
			this.whiteList = this.JSON.decode(this.storage['filter'].getItem('whiteList').value);
		}catch(e){
			adblockSharp.debug('Error is occurred when loading whiteList, so build-in filters (filter:) is used instead. (' + e + ')');
			this.whiteList = {
				plainTextFilter: [],
				regFilter: [],
				starFilter: [],
				prefixSuffixFilter: [],
			};
			adblockSharp.filter.forEach(function(element){
				if(element.indexOf('@@') === 0) adblockSharp.filterManager.sortFilter(element.slice(2), this);
			}, this.whiteList);
		}
	},


	uninit: function(){
		this.storage['filter'].setItem('blackList', this.JSON.encode(this.blackList));
		this.storage['filter'].setItem('whiteList', this.JSON.encode(this.whiteList));
	},


	sortFilter: function(filter, filterset){
		//正規表現フィルター
		if($ = filter.match(/^\/(.*)\/$/)){
			var re = new RegExp("");
			re.compile($[1]);
			filterset.regFilter.push(re);
			return;
		}

		//アスタリスクフィルター
		if($ = filter.match(/^\+(.*)\+$/)){
			var str = $[1].split('*');
			filterset.starFilter.push(str);
			return;
		}

		//前方一致
		if(filter.indexOf("|") === 0){
			filter = filter.substr(1);
			if(filter.indexOf("*") !== -1){
				var str = filter.split('*');
				filterset.prefixSuffixFilter.push([2, str]);
				return;
			}

			filterset.prefixSuffixFilter.push([1, filter]);
			return;
		}

		//後方一致
		if(filter.indexOf("|") === filter.length-1){
			filter = filter.substr(0,filter.length-1);
			if(filter.indexOf("*") !== -1){
				var str = filter.split('*');
				filterset.prefixSuffixFilter.push([4, str]);
				return;
			}

			filterset.prefixSuffixFilter.push([3, filter]);
			return;
		}

		//「/」 で囲まれた単純文字列フィルター
		if($ = filter.match(/^\*\/(.*)\/\*$/)){
			filterset.plainTextFilter.push('/' + $[1] + '/');
			return;
		}

		//アスタリスクフィルター(+不使用)
		if(this.starfilterWithoutPlus || filter.indexOf("*") !== -1){
			var str = filter.split('*');
			filterset.starFilter.push(str);
			return;
		}

		//単純文字列のフィルター
		filterset.plainTextFilter.push(filter);
		return;
	},


	add: function(doc){
		var str = doc.getElementById('filterBox').value, self = adblockSharp.filterManager;
		str = str.split('\n');

		for(let i=0,l=str.length;i<l;i++){
			if(str[i].indexOf('@@') !== 0){
				self.sortFilter(str[i], self.blackList);
			}else{
				self.sortFilter(str[i].slice(2), self.whiteList);
			}
		}

		//更新
		self.updateManager(doc);
		doc.getElementById('filterBox').value = '';
		this.storage['filter'].setItem('blackList', this.JSON.encode(this.blackList));
		this.storage['filter'].setItem('whiteList', this.JSON.encode(this.whiteList));
	},

	change: function(doc){
		adblockSharp.filterManager.delete(doc);
		adblockSharp.filterManager.add(doc);
	},

	delete: function(doc){
		var checked = (function(){
			let selects = doc.getElementsByClassName('selectBox'),len=selects.length,array=[];
			for(let i=0;i<len;i++) if(selects[i].checked) array.push(selects[i]);
			return array;
		})();

		for(let i=checked.length-1;i>=0;i--){
			var filterset = adblockSharp.filterManager[checked[i].getAttribute('listkind')][checked[i].getAttribute('kind')];

			delete adblockSharp.filterManager.storage['result'][filterset[checked[i].getAttribute('number')]];
			filterset.splice(checked[i].getAttribute('number'), 1);
		}

		//更新
		doc.getElementById('filterBox').value = '';
		adblockSharp.filterManager.updateManager(doc);
		this.storage['filter'].setItem('blackList', this.JSON.encode(this.blackList));
		this.storage['filter'].setItem('whiteList', this.JSON.encode(this.whiteList));
	},


	deleteStorage: function(doc, kind){
		if(!confirm('\u672c\u5f53\u306b\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return;
		var storage = this.storage[kind];

		for(let i in storage){
			storage.removeItem(i);
		}

		doc.getElementById('filterBox').value = '';
		adblockSharp.filterManager.updateManager(doc);
	},


	reload: function(doc){
		if(!confirm('\u672c\u5f53\u306b\u518d\u8aad\u8fbc\u3057\u307e\u3059\u304b\uff1f')) return;
		adblockSharp.forceLoadFromScript = true;
		adblockSharp.filterManager.init();
		adblockSharp.forceLoadFromScript = false;
		doc.getElementById('filterBox').value = '';
		adblockSharp.filterManager.updateManager(doc);
	},


	export: function(doc){
		var str = 'filter: [\n';

		function getStr(filterset, filterKind, filterName){
			var str = '',f,l=filterset.length;

			for(let i=0;i<l;i++){
				str += "'" 
					+ adblockSharp.filterManager.getFilterStr({
						filterset: filterset,
						filterKind: filterKind,
						filterName: filterName
					}, i)
					+ "',\n";
			}

			return str;
		}

		str += getStr(adblockSharp.filterManager.blackList.plainTextFilter, 'blackList', 'plainTextFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.blackList.starFilter, 'blackList', 'starFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.blackList.prefixSuffixFilter, 'blackList', 'prefixSuffixFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.blackList.regFilter, 'blackList', 'regFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.whiteList.plainTextFilter, 'whiteList', 'plainTextFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.whiteList.starFilter, 'whiteList', 'starFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.whiteList.prefixSuffixFilter, 'whiteList', 'prefixSuffixFilter'); str += '\n';
		str += getStr(adblockSharp.filterManager.whiteList.regFilter, 'whiteList', 'regFilter'); str += '\n';

		str += '],';

		doc.getElementById('filterBox').value = str;
	},


	// aFilterData = {
	//   filterset: blackList.plainTextFilter,
	//   filterKind: 'blackList',
	//   filterName: 'plainTextFilter',
	// }
	getFilterStr: function(aFilterData, aIndex){
		var str = aFilterData.filterKind === 'whiteList' ? '@@' : '';

		switch(aFilterData.filterName){
			case 'plainTextFilter':
				var f = aFilterData.filterset[aIndex];
				if(/^\/.*\/$/.test(f)){
					str += '*' + f + '*';
				}else{
					str += f;
				}
				break;

			case 'starFilter':
				str += '+' + aFilterData.filterset[aIndex].join('*') + '+';
				break;

			case 'prefixSuffixFilter':
				str += (aFilterData.filterset[aIndex][0] <= 2 ? '|' : '')
						+ aFilterData.filterset[aIndex][1].join('*')
					+  (aFilterData.filterset[aIndex][0] > 2 ? '|' : '');
				break;

			case 'regFilter':
				str += aFilterData.filterset[aIndex]+'';
				break;

			default:
				str += aFilterData.filterset[aIndex];
				break;
		}

		return str;
	},


	matchesAny: function(url, filterset, filtername){
		var len = 0;

		//単純な文字列のフィルターにマッチするかどうか : 高速
		len = filterset.plainTextFilter.length;
		if(len){
			for(let i=0; i!==len; i++){
				if(url.indexOf(filterset.plainTextFilter[i]) !== -1){
					this.setResult(url, filterset.plainTextFilter[i]);
					return true;
				}
			}
		}

		//アスタリスクフィルターにマッチするかどうか : 普通?
		len = filterset.starFilter.length
		if(len){
			var lastMatch,match,isMatch,lena;
			for(let j=0; j!==len; j++){
				lastMatch = -1;
				isMatch = true;
				lena = filterset.starFilter[j].length;
				for(let i=0; i!==lena; i++){
					match = url.indexOf(filterset.starFilter[j][i]);
					isMatch = match > lastMatch;
					if(isMatch) lastMatch = match;
					else break;
				}

				if(isMatch){
					this.setResult(url, filterset.starFilter[j]);
					return true;
				}
			}
		}

		//前方or後方一致フィルターにマッチするかどうか : 普通?
		len = filterset.prefixSuffixFilter.length;
		if(len){
			var filtertemp,filtertemplen;

			for(let i=0; i!==len; i++){
				filtertemp = filterset.prefixSuffixFilter[i][1];
				filtertemplen = filtertemp.length;

				switch(filterset.prefixSuffixFilter[i][0]){

					//前方一致 - 単純文字列
					case 1:
						if(url.indexOf(filtertemp) === 0){
							this.setResult(url, filtertemp);
							return true;
						}
						break;

					//前方一致 - アスタリスク
					case 2:
						var lastMatch = 0, match;
						var isMatch = true;

						if(url.indexOf(filtertemp[0]) !== 0) break;
						for(let j=1; j!==filtertemplen; j++){
							match = url.indexOf(filtertemp[j]);
							isMatch = match > lastMatch;
							if(isMatch) lastMatch = match;
							else break;
						}
		
						if(isMatch){
							this.setResult(url, filtertemp);
							return true;
						}
						break;

					//後方一致 - 単純文字列
					case 3:
						if(url.indexOf(filtertemp) === url.length - filtertemplen){
							this.setResult(url, filtertemp);
							return true;
						}
						break;

					//後方一致 - アスタリスク
					case 4:
						var lastMatch = -1, match;
						var isMatch = true;
						for(let j=0; j!==filtertemplen; j++){
							match = url.indexOf(filtertemp[j]);
							isMatch = match > lastMatch;
							if(isMatch) lastMatch = match;
							else break;
						}

						var fn = filtertemplen-1;
						if(isMatch && url.indexOf(filtertemp[fn]) === url.length - filtertemp[fn].length){
							this.setResult(url, filtertemp);
							return true;
						}
						break;
				}
			}
		}

		//正規表現のフィルターにマッチするかどうか : 低速
		len = filterset.regFilter.length;
		if(len){
			for(let j=0; j!==len; j++){
				if(filterset.regFilter[j].test(url)){
					this.setResult(url, filterset.regFilter[j]+'');
					return true;
				}
			}
		}

		return false;
	},


	setResult: function(url, filter){
		//結果データベースの更新
		var storage = this.storage['result'];
		var data = storage.getItem(filter), str = data && data.value;
		var time =  data ? str.slice(str.indexOf('time')+6, str.lastIndexOf('}')) - (-1) : 1;

		//手動JSONエンコード
		storage.setItem(filter, '{"url":"'+url+'","date":'+(new Date()).getTime()+',"time":'+time+'}');

		adblockSharp.debug('Filter Matched: ' + url + ' (Filter: ' + filter + ')');
	},

	showManager: function(){
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		var browser = mainWindow.gBrowser;
		var tab = browser.addTab('about:blank');
		var newTab = browser.getBrowserForTab(tab);
		browser.selectedTab = tab;

		newTab.addEventListener('load', function(){
			newTab.removeEventListener('load', arguments.callee, true);

			var doc = newTab.contentDocument;
			doc.getElementsByTagName('title')[0].innerHTML += 'adblock#.uc.js Filter Manager';

			var tags = <![CDATA[
				<style type="text/css">
					table,tr,td{ border:1px black solid; }
					table{ border-collapse: collapse; margin-bottom: 1em; }
					input{ border: 1px black solid; margin: 0.5em;}
					input:hover,input:active{ border: 1px #222 solid; background-color: #ddd;}
				</style>

				<h2>adblock#.uc.js Filter Manager</h2>
			]]>;


			tags += '<h3>adblock#.uc.js \u30d5\u30a3\u30eb\u30bf\u30fc\u7d50\u679c</h3>';//フィルター結果

			//結果描画スペース
			tags += '<div id="filterResult"></div>';

			//追加/削除
			tags += "<hr><h3>\u30d5\u30a3\u30eb\u30bf\u30fc\u64cd\u4f5c</h3>";
			tags += '<textarea rows="5" cols="100" id="filterBox"></textarea><br>'
					+'<input type="button" value="\u8ffd\u52a0" id="add">'
					+'<input type="button" value="\u5909\u66f4" id="change">'
					+'<input type="button" value="\u524a\u9664" id="delete">'
					+'<input type="button" value="\u7d50\u679c\u30b9\u30c8\u30ec\u30fc\u30b8\u5168\u524a\u9664" id="resultStorageDelete">'
					+'<input type="button" value="filter\u003a\u0020\u304b\u3089\u518d\u8aad\u8fbc" id="reloadFilter">'
					+'<input type="button" value="\u30d5\u30a3\u30eb\u30bf\u30fc\u3092\u0020filter\u003a\u0020\u5f62\u5f0f\u3067\u66f8\u304d\u51fa\u3059" id="exportFilter">';

			//描画/イベント追加など
			doc.body.innerHTML = tags;
			adblockSharp.filterManager.updateManager(doc);

			doc.getElementById('add').addEventListener('click', function(){ adblockSharp.filterManager.add(doc) }, false);
			doc.getElementById('change').addEventListener('click', function(){ adblockSharp.filterManager.change(doc) }, false);
			doc.getElementById('delete').addEventListener('click', function(){ adblockSharp.filterManager.delete(doc) }, false);
			doc.getElementById('resultStorageDelete').addEventListener('click', function(){
				adblockSharp.filterManager.deleteStorage(doc, 'result');
			}, false);
			doc.getElementById('reloadFilter').addEventListener('click', function(){
				adblockSharp.filterManager.reload(doc);
			}, false);
			doc.getElementById('exportFilter').addEventListener('click', function(){
				adblockSharp.filterManager.export(doc);
			}, false);
		}, true);
	},

	updateManager: function(doc){
		var tags = '';

		function getResult(filterset, filtername, kind, listKind){
			var str = '<caption>' + filtername + '</caption>'
				+'<table><tr style="background-color:#dedede">'
				+'<td>Filter</td><td>Lastest Hit Date</td><td>Hit Times</td><td>Select</td></tr>';

			var len = filterset.length,s,id,jsonData,data;

			for(let i=0;i<len;i++){
				var filterData = {
					filterset: filterset,
					filterKind: listKind,
					filterName: kind
				};

				s = adblockSharp.filterManager.getFilterStr(filterData, i);

				if(kind === 'regFilter'){
					jsonData = adblockSharp.filterManager.storage['result'].getItem(filterset[i]+'');
				}else{
					jsonData = adblockSharp.filterManager.storage['result'].getItem(filterset[i]);
				}

				if(jsonData){
					data = adblockSharp.filterManager.JSON.decode(jsonData.value);
					str += '<tr><td>'+s+'</td>'
							+'<td>'+(new Date(data.date)).toLocaleString()+'</td>'
							+'<td>'+(data.time)+'</td>'
							+'<td><input type="checkbox" class="selectBox" number="'+i+'" kind="'+kind+'" listkind="'+listKind+'"></td></tr>';
				}else{
					str += '<tr><td>'+s+'</td><td>-</td><td>0</td>'
							+'<td><input type="checkbox" class="selectBox" number="'+i+'" kind="'+kind+'" listkind="'+listKind+'"></td></tr>';
				}
			}

			str += '</table>';

			return str;
		};

		tags += '<h4>Black List</h4>';
		tags += getResult(adblockSharp.filterManager.blackList.plainTextFilter
							,'\u5358\u7d14\u6587\u5b57\u5217\u30d5\u30a3\u30eb\u30bf\u30fc', 'plainTextFilter', 'blackList');

		tags += getResult(adblockSharp.filterManager.blackList.starFilter
							,'\u30a2\u30b9\u30bf\u30ea\u30b9\u30af\u30d5\u30a3\u30eb\u30bf\u30fc', 'starFilter', 'blackList');

		tags += getResult(adblockSharp.filterManager.blackList.prefixSuffixFilter
							,'\u524d\u65b9\u002f\u5f8c\u65b9\u4e00\u81f4\u30d5\u30a3\u30eb\u30bf\u30fc', 'prefixSuffixFilter', 'blackList');

		tags += getResult(adblockSharp.filterManager.blackList.regFilter
							,'\u6b63\u898f\u8868\u73fe\u30d5\u30a3\u30eb\u30bf\u30fc', 'regFilter', 'blackList');

		tags += '<h4>White List</h4>';
		tags += getResult(adblockSharp.filterManager.whiteList.plainTextFilter
							,'\u5358\u7d14\u6587\u5b57\u5217\u30d5\u30a3\u30eb\u30bf\u30fc', 'plainTextFilter', 'whiteList');

		tags += getResult(adblockSharp.filterManager.whiteList.starFilter
							,'\u30a2\u30b9\u30bf\u30ea\u30b9\u30af\u30d5\u30a3\u30eb\u30bf\u30fc', 'starFilter', 'whiteList');

		tags += getResult(adblockSharp.filterManager.whiteList.prefixSuffixFilter
							,'\u524d\u65b9\u002f\u5f8c\u65b9\u4e00\u81f4\u30d5\u30a3\u30eb\u30bf\u30fc', 'prefixSuffixFilter', 'whiteList');

		tags += getResult(adblockSharp.filterManager.whiteList.regFilter
							,'\u6b63\u898f\u8868\u73fe\u30d5\u30a3\u30eb\u30bf\u30fc', 'regFilter', 'whiteList');


		doc.getElementById('filterResult').innerHTML = tags;

		var select = doc.getElementsByClassName('selectBox');
		for(let i=0,l=select.length;i<l;i++){
			select[i].addEventListener('change', function(e){
				var filterData = {
					filterset: adblockSharp.filterManager[e.target.getAttribute('listkind')][e.target.getAttribute('kind')],
					filterKind: e.target.getAttribute('listkind'),
					filterName: e.target.getAttribute('kind')
				}

				if(e.target.checked){
					doc.getElementById('filterBox').value += adblockSharp.filterManager.getFilterStr(filterData, e.target.getAttribute('number')) + '\n';
				}else{
					doc.getElementById('filterBox').value = 
						doc.getElementById('filterBox').value.replace(
							adblockSharp.filterManager.getFilterStr(filterData, e.target.getAttribute('number')),
							''
						).replace(/\n\n/g,'\n').replace(/^\n/,'');
				}
			}, false);
		}
	},
};


adblockSharp.observer = {
	start: function(){
		var observer = Components.classes['@mozilla.org/observer-service;1'].getService(Components.interfaces.nsIObserverService);
		observer.addObserver(this, 'http-on-modify-request', false);
	},

	stop: function(){
		var observer = Components.classes['@mozilla.org/observer-service;1'].getService(Components.interfaces.nsIObserverService);
		observer.removeObserver(this, 'http-on-modify-request');
	},

	observe: function(subject, topic, data){
		if(topic !== 'http-on-modify-request' || !adblockSharp.enabled) return;

//		var start = (new Date()).getTime();

		var http = subject.QueryInterface(Components.interfaces.nsIHttpChannel)
		http = http.QueryInterface(Components.interfaces.nsIRequest);

		var url = http.URI.spec;
		var filterManager = adblockSharp.filterManager;

		if( !filterManager.matchesAny(url, filterManager.whiteList) && 
			 filterManager.matchesAny(url, filterManager.blackList)   ){
				http.cancel(Components.results.NS_ERROR_FAILURE);
		}

//		adblockSharp.debug(((new Date()).getTime() - start) + 'ms');
	}
};


adblockSharp.init();
window.addEventListener("unload", function(event){ adblockSharp.uninit(event); }, false);