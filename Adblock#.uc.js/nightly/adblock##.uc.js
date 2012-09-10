// ==UserScript==
// @name        adblock##.uc.js
// @description Block Ads
// @include     main
// @author      nodaguti
// @license     MIT License
// @compatibility Firefox 3.6 - Firefox 15
// @version     12/09/10 22:30 $third-party実装
// ==/UserScript==
// @version     12/09/09 13:20 前回の修正が不十分だった
// @version     12/09/05 19:00 Bug 788290 - Turn javascript.options.xml.chrome off by default
// @version     12/09/03 17:00 アスタリスクと前方一致を使ったフィルタが正しくマッチしないことがあるバグを修正
// @version     12/07/14 12:30 Firefoxが強制終了した後に起動するとobserverの登録がされないバグを修正
// @version     12/05/29 22:00 Global Storageの履歴データが壊れていると正しくデータが引き継がれなくなるバグを修正
// @version     12/05/29 21:30 Firefox 13でFilter Managerが正常に動作しないバグを修正
// @version     12/05/28 21:00 Firefox 13対応
// @note        (12/05/28 21:00 の更新内容の詳細)
//                 - Firefox 13対応
//                 - filter: を廃止
//                 - フィルタのデータをchromeフォルダ内のadblock#.jsonに保存するようにした
//                 - アスタリスク/前方一致/後方一致フィルダで, 特に長いURIにおけるマッチ処理の高速化
//                 - フィルタがマッチした時の処理を高速化
//                 - エラーコンソールでマッチしたフィルタの内容が正しく表示されるようになった
//                 - 正規表現フィルタのフラグを指定できるようにした
//                 - アスタリスクフィルタを「+」なしで利用できるようにするオプションを有効にすると,
//                   単純文字列フィルタもアスタリスクフィルタとして認識してしまうバグを修正
//                 - Filter Managerを刷新
//                 - 単純文字列の前方一致/後方一致フィルタがある場合にFilter Managerが正しく起動できないバグを修正
//                 - 特定の文字列が含まれるフィルタを追加するとFilter Managerが正しく起動できなくなるバグを修正
//                 - 正しく履歴が保存できないことがあるバグを修正
// @version     11/01/30 07:30 Bug 623435 - Rip out deprecated |RegExp.compile| builtin method
// @version     11/01/28 22:00 結果が正しく保存されないことがあるバグを修正
// @version     11/01/25 19:00 マッチ時の処理を少し高速化
// @version     11/01/07 19:30 フィルターの最適化方法に誤りがあったのを修正
// @version     11/01/06 20:50 空白行を追加するとFMが正しく表示されなくなるバグを修正
// @version     11/01/06 17:40 フィルターの最適化ができるように
// @version     11/01/05 17:10 ON/OFFが正しく切り替えられないことがあるバグを修正
// @version     11/01/04 18:00 Firefox4でFMが起動できないバグを修正
// @version     11/01/04 16:00 最後のwindowが閉じられたときにobserverを解除するようにした
// @version     11/01/04 09:00 observerをwindow毎ではなく1回だけ登録するようにした
// @version     11/01/03 17:00 FMで結果が正しく表示されないことがあるバグを修正
// @version     11/01/01 00:30 正規表現フィルタが正しく動作していなかったのを修正
// @version     10/12/31 22:00 結果が正しく保存されないバグを修正
// @version     10/12/30 18:30 adblock#.uc.js Filter Manager を実装
// @version     10/05/21 21:30 正規表現フィルタのマッチ処理を高速化
// @version     10/05/21 20:40 アスタリスクフィルタを+無しでも機能するようにした
// @version     10/05/21 20:30 マッチング処理を15%程度高速化
// @version     09/09/15 19:30 typo
// @version     09/09/14 18:00 ちょこっと高速化
// @version     09/09/09 20:00 前方一致/後方一致フィルタに対応
// @version     09/09/09 17:30 ホワイトリスト対応
// @version     09/09/09 17:10 ON/OFFができるように
// @version     09/08/31 10:30 高速化+メモリリーク対処
// @version     09/08/31 09:30 アスタリスクフィルターが正しく動作していなかったのを修正
// @version     09/08/30 22:00 /ads/のようなフィルターが正規表現と解釈されていたのを修正
// @version     09/08/30 19:00 正規表現/アスタリスクを使ったフィルターに対応
// @version     09/08/29 06:00 単純文字列/アスタリスク使用フィルターに対応(正規表現/?/()を使ったものには未対応)


(function(){

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;
const pref = Cc["@mozilla.org/preferences-service;1"].
					getService(Ci.nsIPrefService).getBranch('adblock#.');
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const effectiveTLD = Cc["@mozilla.org/network/effective-tld-service;1"].getService(Ci.nsIEffectiveTLDService);


if(window.adblockSharp){
	adblockSharp.destroy();
	delete window.adblockSharp;
}


window.adblockSharp = {

	//---- Note ----
	
	//12/05/28 21:00 版より設定はすべてFilter Managerより行うように変更されました.

	//本ファイル内のfilter: にフィルタを書く方法は, 12/05/28 21:00 版で廃止されました.
	//フィルタはFilter Managerより追加してください.
	//10/12/30 18:30より前のバージョンから移行する場合には, filter: の部分を同梱の adblock#.uc.js用リスト変換ツール.html によって
	//変換した後, Filter Managerよりフィルタを追加して下さい.
	//なお, 10/12/30 18:30以降のバージョンを使用していた場合は自動的にデータが引き継がれます.

	//--------


	enabled: true,
	
	blackList: null,
	
	whiteList: null,

	init: function(){
		this._createToolMenu();
		this.load();
		this.observer.start();
		
		window.addEventListener('unload', this.uninit, false);
	},

	uninit: function(){
		window.removeEventListener('unload', arguments.callee, false);
		
		adblockSharp.save();
		adblockSharp.observer.stop();
		adblockSharp.blackList.uninit();
		adblockSharp.whiteList.uninit();
	},
	
	destroy: function(){
		window.removeEventListener('unload', adblockSharp.uninit, false);
		
		var toolMenu = document.getElementById("menu_ToolsPopup");
		toolMenu.removeChild(document.getElementById('adblocksharp-tool-menu-enabled'));
		toolMenu.removeChild(document.getElementById('adblocksharp-tool-menu-manager'));
		
		adblockSharp.save();
		adblockSharp.blackList.uninit();
		adblockSharp.whiteList.uninit();
	},
	
	
	/**
	 * Tools内にadblock#.uc.jsのメニューを作成する
	 * 起動時に一回だけ実行される
	 */
	_createToolMenu: function(){
		var menuPopup = document.getElementById("menu_ToolsPopup");
		var separator = document.getElementById("sanitizeSeparator");
		var menuitem = document.createElement("menuitem");
		menuitem.setAttribute("label", "Enable Adblock#.uc.js");
		menuitem.setAttribute("type", "radio");
		menuitem.setAttribute("checked", true);
		menuitem.setAttribute("id", "adblocksharp-tool-menu-enabled");
		menuitem.addEventListener("command", adblockSharp.toggleEnabled, false);
		menuPopup.insertBefore(menuitem, separator);

		var menuitem2 = document.createElement('menuitem');
		menuitem2.setAttribute("label", "Organize adblock#.uc.js Filter...");
		menuitem2.setAttribute("id", "adblocksharp-tool-menu-manager");
		menuitem2.addEventListener("command", function(){
			adblockSharp.filterManager.launch();
		}, false);
		menuPopup.insertBefore(menuitem2, separator);
	},

	/**
	 * adblock#.uc.jsの有効/無効を切り替える
	 */
	toggleEnabled: function(){
		var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		var enumerator = wm.getEnumerator('navigator:browser');

		while(enumerator.hasMoreElements()){
			var win = enumerator.getNext();
			if(win.adblockSharp){
				win.adblockSharp.enabled ? 
					win.document.getElementById('adblocksharp-tool-menu-enabled').removeAttribute('checked') :
					win.document.getElementById('adblocksharp-tool-menu-enabled').setAttribute('checked', true);

				win.adblockSharp.enabled = !win.adblockSharp.enabled;
			}
		}
	},


	load: function(){
		var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties)
					.get("UChrm", Ci.nsILocalFile);
		file.appendRelativePath('adblock#.json');
		
		if(file.exists()){
			this._loadFromFile(file);
		}else{
			log('adblock#.json is not found in your chrome folder. We will load the data from Global Storage.');
			this._loadFromStorage();
		}
		
	},
	
	_loadFromFile: function(file){
		var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
		var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
		fstream.init(file, -1, 0, 0);
		sstream.init(fstream);
		
		var data = sstream.read(sstream.available());
		
		try{
			data = decodeURIComponent(escape(data));
		}catch(e){}
		
		sstream.close();
		fstream.close();
		
		data = JSON.parse(data);
		
		['blackList', 'whiteList'].forEach(function(listType){
		
			if(this[listType]){
				this[listType].uninit();
				this[listType] = null;
			}
			
			this[listType] = new FilterList();
			
			for(let type in data[listType]){
				if(type === 'history') continue;
				
				var typeObj = this[listType]._getTypeObjByName(type);
				
				//文字列で保存されているフィルタデータをフィルタオブジェクトにする
				var _list = data[listType][type].list.map(function(filter){
					//フィルタとオプションに分ける
					[filter, options] = this[listType].parseOptions(filter);
					
					if(options)
						return {
							filter: typeObj.format(filter),
							option: options
						};
					else
						return typeObj.format(filter);
				}, this);
				
				typeObj.list = _list.concat();
			}
			
			this[listType].history = null;
			this[listType].history = data[listType].history;
		
		}, this);
	},
	
	/**
	 * Global Storageからフィルタデータを読み込む
	 * @note もうメンテしないのですごく汚いけど気にしない
	 */
	_loadFromStorage: function(){
		
		//Global Storageが存在しない場合は初期化して終了
		if(!window.globalStorage){
			log('window.globalStorage is not supported (maybe you are using Firefox 13 or later).');
			
			if(this.blackList){ this.blackList.uninit(); this.blackList = null; }
			if(this.whiteList){ this.whiteList.uninit(); this.whiteList = null; }
			
			this.blackList = new FilterList();
			this.whiteList = new FilterList();
		
			return;
		}
		
		var storage = {
			filter: window.globalStorage['adblockSharp.filter'],
			result: window.globalStorage['adblockSharp.result']
		};
		
		if(this.blackList){ this.blackList.uninit(); this.blackList = null; }
		if(this.whiteList){ this.whiteList.uninit(); this.whiteList = null; }
			
		this.blackList = new FilterList();
		this.whiteList = new FilterList();
		
		['blackList', 'whiteList'].forEach(function(listType){
			if(!storage.filter || !storage.filter.getItem(listType)) return;
		
			var listObj = JSON.parse(storage.filter.getItem(listType).value);
			
			for(var type in listObj){
				
				listObj[type].forEach(function(filter){
					
					switch(type){
					
						case 'plainTextFilter':
						case 'starFilter':
						
							var typeObj = this[listType]._getTypeObjByName(type.replace('Filter', ''));
							typeObj.list.push(filter);
							
							try{
								this[listType].history[typeObj.toString(filter)] = JSON.parse(storage.result.getItem(filter));
							}catch(e){
								//履歴データが壊れている時
								this[listType].history[typeObj.toString(filter)] = null;
							}
							break;
					
						case 'prefixSuffixFilter':
							
							var typeObj = (filter[0] <= 2) ? 
								this[listType]._getTypeObjByName('prefix') : 
								this[listType]._getTypeObjByName('suffix');
								
							typeObj.list.push(filter[1]);
							
							try{
								this[listType].history[typeObj.toString(filter[1])] = JSON.parse(storage.result.getItem(filter[1]));
							}catch(e){
								this[listType].history[typeObj.toString(filter[1])] = null;
							}
							break;
							
						case 'regExpFilter':
							var typeObj = this[listType]._getTypeObjByName(type.replace('Filter', ''));
							
							typeObj.list.push(new RegExp(filter.slice(1, filter.length-1)));
							
							try{
								this[listType].history[filter] = JSON.parse(storage.result.getItem(String(filter)));
							}catch(e){
								this[listType].history[filter] = null;
							}
							break;
							
					}
				}, this);
			}
			
			//history fix (time -> count)
			for(let key in this[listType].history){
				try{
					this[listType].history[key].count = this[listType].history[key].time || 0;
					delete this[listType].history[key].time;
				}catch(ex){}
			}
		}, this);
		
	},
	
	
	save: function(){
		
		//保存データの作成
		var data = {
			blackList: {},
			whiteList: {},
		};
		
		['blackList', 'whiteList'].forEach(function(listType){
		
			if(!this[listType]) return log(listType, 'is empty.');
			
			this[listType].types.forEach(function(typeObj){
			
				//フィルタを文字列化する
				var _list = typeObj.list.map(function(filter){ return typeObj.toString(filter); });
			
				data[listType][typeObj.name] = {
					list: _list
				};
				
			});
			
			data[listType].history = this[listType].history;
			
		}, this);
		
		//encode
		data = JSON.stringify(data);
		
		//save to file
		var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties)
					.get("UChrm", Ci.nsILocalFile);
		file.appendRelativePath('adblock#.json');
		
		var suConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
		suConverter.charset = 'UTF-8';
		data = suConverter.ConvertFromUnicode(data);
		
		var foStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
		foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);
		foStream.write(data, data.length);
		foStream.close();
	}
}


var FilterList = function(){
	this.init();
}

FilterList.prototype = {

	/**
	 * 種類の名前からそのオブジェクト(typesにあるやつ)を取得する
	 * @param {String} name name of type
	 * @return {Object} typeObject
	 */
	_getTypeObjByName: function(name){
	
		//キャッシュにある場合はそれを返す
		if(this._objCache && this._objCache[name]) return this._objCache[name];
	
		//ない場合は検索する
		for(let i = 0, l = this.types.length; i < l; i++){
			if(this.types[i].name === name){
			
				//キャッシュに登録
				if(!this._objCache) this._objCache = {};
				this._objCache[name] = this.types[i];
			
				return this.types[i];
			}
		}
	},
	
	init: function(){

		/**
		 * フィルタのデータ
		 *
		 * {
		 *    (String) name: フィルタの種類名
		 *    (Boolean:Function) match(String:filter, String:url) マッチ処理を行う関数
		 *    (Boolean:Function) isThisType(String:filter) 種類に合致するフィルタかどうかを返す関数
		 *    (FilterObject:Function) format(String:filter, Array:options)
		 *                               フィルタを整形する関数 予めマッチ処理が行いやすい形(正規表現ならRegExpオブジェクト)にしたものを返す
		 *    (String:Function) toString(FilterObject:filter) フォーマット済みフィルタデータを文字列形式にする関数
		 *    (Array) list フィルタのリスト
		 * }
		 *
		 * @type Array
		 */
		 this.types = [
		
			{
				name: 'regExp',
				
				name_ja: '正規表現フィルタ',
				
				list: [],
				
				isThisType: function(filter){
					return filter[0] === '/' && filter[filter.length - 1] === '/';
				},
				
				format: function(filter){
					return new RegExp(filter.slice(1, -1), getPref('regexp-frags'));
				},
				
				match: function(filter, url){
					return filter.test(url);
				},
				
				toString: function(filter){
					if(filter.option)
						return filter.filter.toString() + '$' + filter.option.original;
					else
						return filter.toString();
				},
			},
			
			{
				name: 'star',
				
				name_ja: 'アスタリスクフィルタ',
				
				list: [],
				
				isThisType: function(filter){
					var tmp = filter.slice(1, -1);
					
					return (filter[0] === '+' && filter[filter.length-1] === '+') || 
						   ( getPref('star-filter-without-plus') && tmp.indexOf("*") !== -1 );
				},
				
				format: function(filter){
					if( ( filter[0] === '+' && filter[filter.length-1] === '+' ) ||
						( filter[0] === '*' && filter[filter.length-1] === '*' )   ){
						filter = filter.slice(1, -1);
					}
	
					return filter.split('*');
				},
				
				match: function(filter, url){
					var lastMatch = 0,
						match = -1;
				
					for(let j=0, l=filter.length; j!==l; j++){
					
						match = url.indexOf(filter[j], lastMatch);
						
						if(match !== -1){
							lastMatch = match + filter[j].length + 1;
						}else{
							return false;
						}
						
					}

					return true;
				},
				
				toString: function(filter){
					if(filter.option)
						return '+' + filter.filter.join('*') + '+' + '$' + filter.option.original;
					else
						return '+' + filter.join('*') + '+';
				},
			},
			
			{
				name: 'prefix',
				
				name_ja: '先頭一致フィルタ',
				
				list: [],
				
				isThisType: function(filter){
					return filter[0] === '|';
				},
				
				format: function(filter){
					var $ = filter.substr(1);
					return $.indexOf('*') !== -1 ? $.split('*') : $;
				},
				
				match: function(filter, url){
					if(typeof filter === 'string'){
						//単純文字列
						return url.lastIndexOf(filter, 0) !== -1;
					}else{
						//アスタリスク
						
						//先頭
						if(url.lastIndexOf(filter[0], 0) === -1) return false;
						
						//2番目以降
						var lastMatch = filter[0].length,
							match = -1;
				
						for(let j=1, l=filter.length; j!==l; j++){
						
							var match = url.indexOf(filter[j], lastMatch);
							
							if(match !== -1){
								lastMatch = match + filter[j].length + 1;
							}else{
								return false;
							}
							
						}
						
						return true;
					}
				},
				
				toString: function(filter){
					var opt = '';
					
					if(filter.option){
						opt = '$' + filter.option.original;
						filter = filter.filter;
					}
					
					
					if(typeof filter === 'string'){
						return '|' + filter + opt;
					}else{
						return '|' + filter.join('*') + opt;
					}
				},
			},
			
			{
				name: 'suffix',
				
				name_ja: '後方一致フィルタ',
				
				list: [],
				
				isThisType: function(filter){
					return filter[filter.length - 1] === '|';
				},
				
				format: function(filter){
					var $ = filter.substr(0, filter.length-1);
					return $.indexOf('*') !== -1 ? $.split('*') : $;
				},
				
				match: function(filter, url){
					if(typeof filter === 'string'){
						//単純文字列
						return url.indexOf(filter, url.length - filter.length) !== -1;
					}else{
						//アスタリスク
						
						//一番後ろ
						var lastChild = filter[filter.length-1];
						if(url.indexOf(lastChild, url.length - lastChild.length) === -1) return false;
						
						//2番目以降
						var lastMatch = 0,
							match = -1;
				
						for(let j=0, l=filter.length - 1; j!==l; j++){
						
							var match = url.indexOf(filter[j], lastMatch);
							
							if(match !== -1){
								lastMatch = match + filter[j].length + 1;
							}else{
								return false;
							}
							
						}
						
						return true;
					}
				},
				
				toString: function(filter){
					var opt = '';
					
					if(filter.option){
						opt = '$' + filter.option.original;
						filter = filter.filter;
					}
					
					
					if(typeof filter === 'string'){
						return filter + '|' + opt;
					}else{
						return filter.join('*') + '|' + opt;
					}
				},
			},
			
			{
				name: 'plainText',
				
				name_ja: '単純文字列フィルタ',
				
				list: [],
				
				isThisType: function(filter){
					/* 特殊な書式でないフィルタはすべて単純文字列フィルタ */
					return true;
				},
				
				format: function(filter){
					var $;
					filter = ($ = filter.match(/^\*\/(.*)\/\*$/)) ? '/' + $[1] + '/' : filter;
					
					return filter;
				},
				
				match: function(filter, url){
					return url.indexOf(filter) !== -1;
				},
				
				toString: function(filter){
					var opt = '';
					
					if(filter.option){
						opt = '$' + filter.option.original;
						filter = filter.filter;
					}
					
					
					if(/^\/.*\/$/.test(filter)){
						return '*' + filter + '*' + opt;
					}else{
						return filter + opt;
					}
				},
			},
			
		];


		/**
		 * マッチ履歴
		 * フィルタ文字列をキーとした以下のオブジェクトの集合
		 *
		 * {
		 *    url: 最後にマッチしたURL
		 *    count: マッチした回数
		 *    date: 最後にマッチした日時
		 * }
		 *
		 * @type Object
		 */
		this.history = {};
		
		
		this.observer = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
		this.observer.addObserver(this, 'adblock#:FilterMatched', false);
		this.observer.addObserver(this, 'adblock#:FilterAdded', false);
		this.observer.addObserver(this, 'adblock#:FilterDeleted', false);
	},
	
	uninit: function(){
		this.observer.removeObserver(this, 'adblock#:FilterMatched');
		this.observer.removeObserver(this, 'adblock#:FilterAdded');
		this.observer.removeObserver(this, 'adblock#:FilterDeleted');
	},
	
	/**
	 * フィルタがマッチ、追加、削除された時の処理を非同期に行うための関数
	 * notifyObserverによって呼び出される
	 */
	observe: function(subject, topic, data){
		if(topic.lastIndexOf('adblock#:', 0) === -1) return;
		
		var data = JSON.parse(data);
		
		switch(topic){
		
			case 'adblock#:FilterMatched':
			
				var typeObj = this._getTypeObjByName(data.typeName);
				if(data.filter !== typeObj.toString(typeObj.list[data.index])) return;
				
				var history = this.history[data.filter];
				var count =  history ? history.count+1 : 1;
				
				this.history[data.filter] = {
					date: data.date,
					url: data.url,
					count: count
				};
			
				break;
				
				
			case 'adblock#:FilterAdded':
				//すでに追加されている場合はスルー
				if(adblockSharp._addFilterFlag){
					adblockSharp._addFilterFlag = false;
					return;
				}
				
				//そうじゃないときはフィルタを再読み込みする
				adblockSharp.load();
			
				break;
				
				
			case 'adblock#:FilterDeleted':
				var typeObj = this._getTypeObjByName(data.typeName);
				var filter = typeObj.list[data.index];
				
				//存在しないフィルタの場合
				if(!filter || data.filter !== typeObj.toString(filter)) return;
				
				delete this.history[data.filter];
				typeObj.list.splice(data.index, 1);
			
				break;
				
			case 'adblock#:OptimizeFilter':
			
				//すでに最適化済みの時はしない
				if(this._optimizedFlag){
					this._optimizedFlag = false;
					return;
				}
				
				this.optimize(true);
		}

	},
	
	
	/**
	 * オプションを解析する
	 * @param {String} filter_
	 * @return {Array} filter, options(Option Object)
	 */
	parseOptions: function(filter_){

		var optStart = filter_.lastIndexOf('$');
		
		//オプションがない場合
		//正規表現中には$が現れる場合があるので別枠
		//(フィルタオプションを除外しない状態で正規表現だと判断されれば, その正規表現フィルタにオプションはついていない)
		if(optStart === -1 || (filter_[0] === '/' && filter_[filter_.length-1] === '/')){
			return [filter_, null];
		}
		
		
		var filter = filter_.substr(0, optStart);
		var options = filter_.substr(optStart + 1);
		
		log(optStart, filter, options);
		
		//解析して結果を返す
		var result = {
			thirdParty: null,  //true: third-party, false: first-party, null: all
			restrict: [],
			except: [],
			original: options
		};
		
		//domain, third-partyにのみ対応しているので、
		//それらを抜き出す
		options = options.split(',').filter(function(item){
			return item.lastIndexOf('domain', 0) !== -1 || item.indexOf('third-party') !== -1;
		});
		
		//ドメイン名 or third-partyにばらす
		options.forEach(function(item){
		
			switch(item){
			
				case 'third-party':
					result.thirdParty = true;
					break;
					
				case '~third-party':
					result.thirdParty = false;
					break;
				
				default:
					item = item.replace('domain=', '');
					item.split('|').forEach(function(domain){
						if(domain[0] === '~')
							result.except.push(domain.substr(1));
						else
							result.restrict.push(domain);
					});
					break;
			}
			
		});
		
		return [filter, result];
	},
	
	
	/**
	 * 全フィルタにマッチするかどうか調べる
	 * @param {nsIRequest} http
	 * @return {Boolean} マッチしたかどうか
	 */
	match: function(http){
		
		//接続先の情報
		var to = {
			url: http.URI.spec,
			host: http.URI.host,
			scheme: http.URI.scheme
		};
		
		//接続元の情報
		var win = getRequesterWindow(http);
		var from = win ? {
			url: win.location.href,
			host: win.location.host,
			protocol: win.location.protocol
		} : {};
		
		
		return this.types.some(function(typeObj){
			return typeObj.list.some(function(filter, index){
			
				//まずオプションについて調べる
				if(typeof filter === 'object' && filter.option){
					
					if(!this.matchOption(filter.option, to, from))
						return false;
					
					//これ以降の処理はoptionは関係ないのでfilterだけにする
					filter = filter.filter;
				}
			
				if(typeObj.match(filter, to.url)){
					
					//notify filter was matched
					var matchData = {
						typeName: typeObj.name,
						index: index,
						filter: typeObj.toString(filter),
						date: (new Date()).getTime(),
						url: to.url
					};
					
					this.observer.notifyObservers(null, 'adblock#:FilterMatched', JSON.stringify(matchData));
					
					//Log
					log('[Filter Matched] ' + to.url + ' (filter: ' + matchData.filter + ')');
					
					return true;
				}else{
					return false;
				}

			}, this);
		}, this);
	},
	
	
	matchOption: function(option, to, from){
		//third-party check
		if(option.thirdParty !== null){
			let isThird = !(to.scheme == from.protocol && to.host == from.host);
			if( (option.thirdParty && !isThird) || (!option.thirdParty && isThird) ) return false;
		}
		
		//domain check
		if(option.except.length){
			
			
			
		}
		
		return true;
	},
	
	
	/**
	 * フィルタを追加する
	 * @param {String|Array} filterArray 追加するフィルタの配列
	 */
	add: function(filterArray){
		if(typeof filterArray === 'string')
			filterArray = [ filterArray ];
	
		filterArray.forEach(function(filter){
			var options;
			
			//フィルタとオプションに分ける
			[filter, options] = this.parseOptions(filter);
		
			//合致するフィルタの種類を調べて、追加する
			this.types.some(function(typeObj){
			
				if(typeObj.isThisType(filter)){
					
					if(options){
						typeObj.list.push({
							filter: typeObj.format(filter),
							option: options
						});
					}else{
						typeObj.list.push( typeObj.format(filter) );
					}
					
					return true;
				}
				
				return false;
				
			}, this);
			
		}, this);
		
		//保存
		adblockSharp.save();
		
		//無駄な再読み込みを避けるためのフラグ
		adblockSharp._addFilterFlag = true;
		
		//他のウィンドウに通知する
		this.observer.notifyObservers(null, 'adblock#:FilterAdded', null);
	
	},
	
	/**
	 * フィルタを削除する
	 * @param {String|Number} type フィルタの種類
	 * @param {Number} index 削除するフィルタの添え字番号
	 */
	delete: function(type, index){
		if(typeof type == 'number')
			type = this.types[type].name;
		
		var typeObj = this._getTypeObjByName(type);
		
		var data = {
			typeName: type,
			index: index,
			filter: typeObj.toString(typeObj.list[index])
		};
		
		delete this.history[data.filter];
		typeObj.list.splice(index, 1);
		
		this.observer.notifyObservers(null, 'adblock#:FilterDeleted', JSON.stringify(data));
	},
	
	/**
	 * フィルタの順序を最適化する
	 * よりヒットしているフィルタを前に持ってくることで、マッチ時間が短くなる（かも）
	 */
	optimize: function(notNotify){
		var that = this;
		
		this.types.forEach(function(typeObj){
		
			typeObj.list.sort(function(a, b){
				var aStr = typeObj.toString(a);
				var bStr = typeObj.toString(b);
				var aHistory = that.history[aStr];
				var bHistory = that.history[bStr];
				
				if(!aHistory) return 1;
				if(!bHistory) return -1;
			
				return (bHistory.count - aHistory.count) || (bHistory.date - aHistory.date) || 1;
			});
			
		}, this);
		
		if(notNotify){
			//notifyとで二重に最適化されるのを防ぐためのフラグ
			this._optimizedFlag = true;
			
			this.observer.notifyObservers(null, 'adblock#:OptimizeFilter', null);
		}
	},
	
};


adblockSharp.observer = {
	
	_observer: null,
	
	/**
	 * observerを登録する
	 */
	start: function(){
		var enumerator = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator)
								.getEnumerator('navigator:browser');
		
		//すでにスタートしていたら何もしない
		while(enumerator.hasMoreElements()){
			var win = enumerator.getNext();
			if(win.adblockSharp.observer._observer) return;
		}
		
		//どのウィンドウでもobserverが登録されていないときは登録処理を行う
		this._observer = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
		this._observer.addObserver(this, 'http-on-modify-request', false);
		log('Observer started.');
	},

	
	/**
	 * observerをストップする
	 * その際他のウィンドウがあるならそこにobserverを委託する
	 * ウィンドウが閉じられるときに呼び出される
	 */
	stop: function(){
		var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");

		var enumerator = wm.getEnumerator('navigator:browser');
		var isLastWindow = !enumerator.hasMoreElements();

		//このウィンドウにobserverがあるならobserverを削除する
		if(this._observer){
			//remove observer
			this._observer.removeObserver(this, 'http-on-modify-request');
			this._observer = null;
			log('Observer removed.');
	
			//もし他のウィンドウがあるなら, そのウィンドウにobserverを委託する
			if(!isLastWindow && mainWindow && mainWindow.adblockSharp){
				mainWindow.adblockSharp.observer.start();
			}
		}
	},

	observe: function(subject, topic, data){
		if(topic !== 'http-on-modify-request' || !adblockSharp.enabled) return;

		var http = subject.QueryInterface(Ci.nsIHttpChannel)
		http = http.QueryInterface(Ci.nsIRequest);

		if( !adblockSharp.whiteList.match(http) && 
			 adblockSharp.blackList.match(http)    ){
				http.cancel(Cr.NS_ERROR_FAILURE);
		}
	}
};



/* *** Filter Manager *** */
adblockSharp.filterManager = {
	
	template: btoa("" +
		"<!DOCTYPE html>\
		<html lang='ja'>\
		<head>\
			<meta charset='utf-8' />\
			<title>adblock#.uc.js Filter Manager</title>\
			<style>\
				*{\
					line-height: 1.5;\
					-moz-box-sizing: border-box;\
					box-sizing: border-box;\
					margin: 0;\
					padding: 0;\
					font-weight: normal;\
				}\
				body{\
					overflow-x: hidden;\
				}\
				#container{\
				}\
				#sidebar{\
					background-color: #efefef;\
					color: #333;\
					border-right: 1px #ccc solid;\
					border-bottom: 1px #ccc solid;\
					text-align: right;\
					position: fixed;\
					top: 0; left: 0;\
					width: 20%;\
					height: 100%;\
				}\
				#main{\
					margin-left: 20%;\
					width: 80%;\
				}\
				#page-title{\
					padding: 0.3em;\
				}\
				\
				#menu{\
					margin-top: 1em;\
					list-style-type: none;\
				}\
				#menu a{\
					text-decoration: none;\
					color: black;\
					display: block;\
					padding: 0.5em;\
					padding-right: 1.2em;\
					cursor: pointer;      /* for Firefox 3.6 */\
				}\
				#menu a:hover{\
					background-color: #b8baff;\
					outline: 1px skyblue solid;\
				}\
				\
				#blackList, #whiteList, #pref{\
					display: none;\
					padding: 1em;\
				}\
				#blackList:target, #whiteList:target, #pref:target{\
					display: block;\
				}\
				\
				#main h1{\
					border-bottom: #ccc 1px solid;\
					padding-right: 85%;\
					margin-bottom: 1.3em;\
					min-width: 11em;\
					white-space: nowrap;\
				}\
				#main h2{\
					font-weight: bold;\
					font-size: 90%;\
				}\
				#main h2 + *{\
					margin-top: -1.5em;\
					margin-left: 20%;\
				}\
				#main h3{\
					color: #333;\
					margin-bottom: 1.3em;\
				}\
				#main h3 + *{\
					font-size: 90%;\
					margin-left: 1.5em;\
				}\
				\
				input[type='text']{\
					border: 1px #bfbfbf solid;\
					border-radius: 3px;\
					-moz-border-radius: 3px;\
					color: #444;\
					padding: 3px;\
				}\
				button, input[type='checkbox'], select{\
					background-image: linear-gradient(to bottom, #ededed, #ededed 38%, #dedede);\
					background-image: -moz-linear-gradient(top, #ededed, #ededed 38%, #dedede);\
					border: 1px #ccc solid;\
					border-radius: 3px;\
					-moz-border-radius: 3px;\
					box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);\
					-moz-box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);\
					color: #444;\
					text-shadow: 0 1px 0 #f0f0f0;\
					padding: 2px 10px;\
					margin: 0 5px;\
				}\
				button::-moz-focus-inner{\
					border: 0 !important;\
					padding: 0 !important;\
				}\
				textarea{\
					resize: none;\
				}\
				\
				table{\
					border-collapse: collapse;\
					outline: 1px solid #bcbcbc;\
					max-width: 80%;\
				}\
				tr, td{\
					padding: 5px;\
					cursor: default;\
				}\
				tr.header td{\
					background-color: #cccccc;\
					background-image: -moz-linear-gradient(top, #fff, #ccc);\
					background-image: linear-gradient(to bottom, #fff, #ccc);\
					border-right: 1px #333 solid;\
					padding: 2px 10px 2px 5px;\
				}\
				tr.header td:last-child{\
					border-right: none;\
				}\
				tr:not(.header):hover,\
				tr.selected{\
					background-color: #b8baff;\
				}\
				hr{\
					border: 1px #efefef solid;\
					margin: 1.3em 0;\
				}\
				.list-table-container hr{\
					border: none;\
				}\
				.list-table-container hr:not(:first-child){\
					border: #efefef 1px solid;\
					width: 95%;\
					margin: 1.3em 0;\
				}\
				.filter-editbox{\
					width: 100%;\
					height: 1.5em;\
					border: 1px #ccc solid;\
					font-size: 100%;\
					font-family: sans;\
				}\
				\
				#dialog-wrapper{\
					width: 100%;\
					height: 100%;\
					background-color: rgba(0, 0, 0, 0.45);\
					z-index: 99;\
					display: none;\
					position: fixed;\
					top: 0; left: 0;\
				}\
				.dialog{\
					border: 1px #666 solid;\
					border-radius: 6px;\
					-moz-border-radius: 6px;\
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.5) inset;\
					-moz-box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.5) inset;\
					background-color: #fefefe;\
					padding: 1em;\
					position: fixed;\
					box-sizing: content-box;\
					-moz-box-sizing: content-box;\
					color: #444;\
					font-size: 90%;\
					overflow-x: hidden;\
					overflow-y: auto;\
					max-width: 90%;\
					max-height: 95%;\
				}\
				.dialog-textarea{\
					padding: 3px;\
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6) inset;\
					-moz-box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6) inset;\
					width: 100%;\
					margin: 1em auto;\
				}\
				.dialog-button-wrapper{\
					position: absolute;\
					bottom: 10px;\
					right: 10px;\
				}\
				.dialog-size-judgement{\
					visibility: hidden;\
					position: absolute;\
					top: 0; left: 0;\
					width: auto; height: auto;\
					line-height: 1.8;\
					padding: 1em;\
					padding-bottom: 1.5em;\
					box-sizing: content-box;\
					-moz-box-sizing: content-box;\
				}\
				\
				#toolbar-wrapper{\
					width: 100%;\
					position: absolute;\
					bottom: 1.5em;\
					left: 0;\
					text-align: center;\
				}\
				#toolbar{\
					display: inline-block;\
				}\
				.toolbar-button{\
					font-family: Arial, Helvetica, sans-serif;\
					font-size: 130%;\
					line-height: 1.0;\
					color: #3c3c3c;\
					height: 1.2em;\
					width: 1.8em;\
					margin: 0 5px;\
					background: -moz-linear-gradient(top, #efefef, #bcbcbc);\
					background: linear-gradient(to bottom, #efefef, #bcbcbc);\
					border-radius: 5px;\
					-moz-border-radius: 5px;\
					border: 1px solid #555;\
				}\
				\
				#script-information{\
					position: absolute;\
					bottom: 1.5em;\
					left: 20%;\
					margin-left: 1em;\
				}\
			</style>\
		</head>\
		<body>\
			<div id='container'>\
				<div id='sidebar'>\
					<h1 id='page-title'>Filter Manager</h1>\
				\
					<ul id='menu'>\
						<li><a href='#blackList'>Black List</a></li>\
						<li><a href='#whiteList'>White List</a></li>\
						<li><a href='#pref'>Preference</a></li>\
					</ul>\
					<div id='toolbar-wrapper'><div id='toolbar'></div></div>\
				</div>\
				\
				<div id='main'>\
					<div id='blackList'>\
						<h1>Black List</h1>\
						<div class='list-table-container'></div>\
					</div>\
					<div id='whiteList'>\
						<h1>White List</h1>\
						<div class='list-table-container'></div>\
					</div>\
					<div id='pref'>\
						<h1>Preference</h1>\
						\
						<h2>正規表現</h2>\
						<p>\
							正規表現のフラグ: <input type='text' id='pref-regexp-flags' />\
						</p>\
						\
						<hr />\
						\
						<h2>フィルタ認識</h2>\
						<p>\
							<label>\
								<input type='checkbox' id='pref-star-filter-without-plus' /> +なしでもアスタリスクフィルタとして認識する\
							</label>\
						</p>\
						\
						<div id='script-information'>\
							<h3>adblock#.uc.jsについて</h3>\
							<p>\
								adblock#.uc.jsは<a href='https://github.com/nodaguti/userChrome.js/tree/master/Adblock%23.uc.js'>Github</a>でホストされています.<br />\
								このスクリプトは<a href='http://www.opensource.org/licenses/mit-license.php'>MIT License</a>の下で配布されています.<br />\
								<a href='https://github.com/nodaguti/userChrome.js/commits/master.atom'>RSS</a>により本スクリプトの更新情報を購読できます.\
							</p>\
						</div>\
					</div>\
				</div>\
			</div>\
			\
			<div id='dialog-wrapper'></div>\
		</body>\
	</html>".replace(/[\t\n]/g, "")),
	
	$: function(id){
		return this.doc.getElementById(id);
	},
	
	createNode: function(aTagName, attributes, aOwner){
		var tag = this.doc.createElement(aTagName);
	
		if(attributes) this.setAttributes(tag, attributes);
		if(aOwner) aOwner.appendChild(tag);
		
		return tag;
	},
	
	setAttributes: function(aElement, attributes){
		for(var i in attributes){
			if(i === ':context'){
				//テキストノードの場合
				aElement.appendChild( this.doc.createTextNode(attributes[i]) );
				
			}else if(i === ':child'){
				//innerHTML
				var dom = typeof attributes[i] === 'string' ? this.textToDOM(attributes[i]) : attributes[i];
				if(dom) aElement.appendChild(dom);
				else aElement.innerHTML = attributes[i];
				
			}else{
				aElement.setAttribute(i, attributes[i]);
			}
		}
	},
	
	textToDOM: function(aString){
		var range = this.doc.createRange();
		return range.createContextualFragment(aString);
	},
	
	launch: function(){
		var browser = window.gBrowser;
		var tab = browser.addTab('data:text/html,' + encodeURIComponent(this.template));
		var tabBrowser = browser.getBrowserForTab(tab);
		
		browser.selectedTab = tab;
		
		var that = this;
		
		tabBrowser.addEventListener('DOMContentLoaded', function(){
			tabBrowser.removeEventListener('DOMContentLoaded', arguments.callee, true);
			
			that.win = tabBrowser.contentWindow;
			that.doc = tabBrowser.contentDocument;
			that.init();
			that.update();
		}, false);
	},
	
	init: function(){
		var that = this;

		this._addContext();
		this._addToolbar();
		
		//bodyのイベント追加
		this.doc.body.addEventListener('mousedown', function(event){
			//フォーム要素, a要素の時には何もしない
			if(event.target.nodeName.toLowerCase().search(/^(:?input|textarea|button|a|label)$/) !== -1) return;
			
			that._clearSelection();
			that._finishEditingFilter();
			that.applyPreference();
		}, false);
		
		//bodyのイベント追加（aタグでmousedownが発火しないことへの対策）
		this.doc.body.addEventListener('click', function(event){
			if(event.target.nodeName.toLowerCase() !== 'a') return;
			
			that._clearSelection();
			that._finishEditingFilter();
			that.applyPreference();
		}, false);
		
		//Firefox3.6でdata URI中でlocation.hashが動かないことへの対策
		//もしかしたらFirefox4-11にも同様のバグがあるかもしれないが, 自動アップデートにより
		//すくなくともFirefox12にはアップデートされているはずなのでとりあえずFirefox3.6のみを対象にする
		var geckoVersion = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).platformVersion;
		
		if(geckoVersion.indexOf('1.9.2') !== -1){
			var tabs = Array.slice(this.doc.querySelectorAll('#menu > li > a'));
			tabs.forEach(function(tab){
				tab.addEventListener('click', function(event){
					that.win.location.href = that.win.location.href.replace(/#\w+?$/, tab.href);
				}, false);
			});
		}
		
		//設定を反映させる
		var prefs = Array.slice(this.doc.querySelectorAll('[id^="pref-"]'));
		
		prefs.forEach(function(pref){
			var key = pref.id.replace('pref-', '');
			
			if(pref.type === 'checkbox')
				pref.checked = getPref(key);
			else
				pref.value = getPref(key);
		}, this);
		
		//ブラックリストを開く
		this.doc.defaultView.location.href += '#blackList';
	},
	
	_addContext: function(){
		var that = this;
		
		var menu = this.createNode('menu', { 'type': 'context', 'id': 'extra-context-menu' }, this.doc.body);
		var context_change = this.createNode('menuitem', { 'label': btoa('編集'), 'id': 'context-change' }, menu);
		var context_delete = this.createNode('menuitem', { 'label': btoa('削除'), 'id': 'context-delete' }, menu);
		var context_add = this.createNode('menuitem', { 'label': btoa('追加'), 'id': 'context-add' }, menu);
		
		//menuitemのイベントを追加
		context_change.addEventListener('click', function(event){
			event.stopPropagation();
			that.changeFilter(event);
		}, false);
		context_delete.addEventListener('click', function(event){
			event.stopPropagation();
			that.deleteFilter(event);
		}, false);
		context_add.addEventListener('click', function(event){
			event.stopPropagation();
			that.addFilter(event);
		}, false);
	},
	
	_addToolbar: function(){
		var that = this;
		
		var toolbar = this.$('toolbar');
		
		var button_add = this.createNode('button', {
			':context': '+', 'class': 'toolbar-button', id: 'button-add', title: btoa('追加')
		}, toolbar);
		
		var button_delete = this.createNode('button', {
			':context': '-', 'class': 'toolbar-button', id: 'button-delete', title: btoa('削除')
		}, toolbar);
		
		var button_change = this.createNode('button', {
			':context': btoa('✐'), 'class': 'toolbar-button', id: 'button-change', title: btoa('編集')
		}, toolbar);
		
		var button_optimize = this.createNode('button', {
			':context': btoa('⚙'), 'class': 'toolbar-button', id: 'button-optimize', title: btoa('最適化')
		}, toolbar);
		
		
		//ツールバーのイベントを追加
		button_change.addEventListener('click', function(event){
			event.stopPropagation();
			that.changeFilter(event);
		}, false);
		button_delete.addEventListener('click', function(event){
			event.stopPropagation();
			that.deleteFilter(event);
		}, false);
		button_add.addEventListener('click', function(event){
			event.stopPropagation();
			that.addFilter(event);
		}, false);
		button_optimize.addEventListener('click', function(event){
			event.stopPropagation();
			that.optimize(event);
		}, false);
	},
	
	/**
	 * 表示を更新する
	 */
	update: function(){
		
		['blackList', 'whiteList'].forEach(function(listType){

			var container = this.doc.querySelector('#' + listType + ' > .list-table-container');
			
			while(container.hasChildNodes()){
				container.removeChild(container.firstChild);
			}
			
			adblockSharp[listType].types.forEach(function(typeObj, typeIndex){
			
				this.createNode('hr', null, container);
				this.createNode('h2', { ':context': btoa(typeObj.name_ja) }, container);
				
				//この種類のフィルタがないとき
				if(!typeObj.list.length){
					this.createNode('p', { ':context': 'No Filters.' }, container);
					return;
				}
				
				//table
				var table = this.createNode('table', { 'class': 'list-table', id: 'list-table-' + typeIndex }, container);
				var tbody = this.createNode('tbody', null, table);
				
				//header
				var htr = this.createNode('tr', { 'class': 'header' }, tbody);
				
				this.createNode('td', { ':context': 'Filter' }, htr);
				this.createNode('td', { ':context': 'Count' }, htr);
				this.createNode('td', { ':context': 'Latest Hit Date' }, htr);
				
				//Filter lists
				typeObj.list.forEach(function(filter, index){
				
					filter = typeObj.toString(filter);
					
					var history = adblockSharp[listType].history[filter];
					
					if(history){
						var tr = this.createNode('tr', { contextmenu: 'extra-context-menu', 'class': 'filter-' + index }, tbody);
						
						this.createNode('td', { ':context': filter }, tr);
						this.createNode('td', { ':context': history.count, 'style': 'text-align: right;' }, tr);
						this.createNode('td', { ':context': formatDate(history.date) }, tr);
					}else{
						var tr = this.createNode('tr', { contextmenu: 'extra-context-menu', 'class': 'filter-' + index }, tbody);
						
						this.createNode('td', { ':context': filter }, tr);
						this.createNode('td', { ':context': '0', 'style': 'text-align: right;' }, tr);
						this.createNode('td', null, tr);
					}
					
				}, this);
			
			}, this);
			
			//イベントの設定
			var that = this;
			var rows = Array.slice(this.doc.querySelectorAll('#' + listType + ' tr[contextmenu]'));
			rows.forEach(function(row){
				row.addEventListener('mousedown', function(event){ that.select(event) }, false);
				row.addEventListener('dblclick', function(event){ that.changeFilter(event) }, false);
			}, this);
		}, this);
	
	},
	
	
	select: function(event){
		event.stopPropagation();
		
		if(event.target.nodeName.toLowerCase() !== 'td') return;
		
		event.preventDefault();
		
		//Ctrl, Shift, Meta(Command)キーが押されていなければ、他の選択状態をクリア
		if(!event.ctrlKey && !event.shiftKey && !event.metaKey && event.button === 0){
			this._clearSelection();
		}
		
		//対象の要素の選択状態をトグルする
		if(event.button === 0) event.currentTarget.classList.toggle('selected');
		else event.currentTarget.classList.add('selected');
		
		//shiftキーの場合は、間の要素も選択状態にする
		if(event.shiftKey && this._lastSelected && 
		   this._lastSelected.parentNode.parentNode.id === event.currentTarget.parentNode.parentNode.id){
			
			var startNum = this._lastSelected.className.match(/-(\d+)\s*/)[1] - 0;
			var endNum = event.currentTarget.className.match(/-(\d+)\s*/)[1] - 0;
			
			if(startNum > endNum) [startNum, endNum] = [endNum, startNum];
			
			//始点と終点の間に1つ以上の要素がある場合のみ
			if(endNum > startNum + 1){
				
				for(let i = startNum+1; i < endNum; i++){
				
					var row = event.currentTarget.parentNode.getElementsByClassName('filter-' + i)[0];
					row.classList.add('selected');
				
				}
				
			}
		}
		
		//文字列選択の解除
		this.win.getSelection().collapse(this.doc, 0);
		
		//shiftキー処理のために選択した要素を保存する
		this._lastSelected = event.currentTarget;
	},
	
	_clearSelection: function(){
		var selected = Array.slice(this.doc.getElementsByClassName('selected'));
		
		selected.forEach(function(item){
			item.classList.remove('selected');
		});
	},
	
	deleteFilter: function(event){
		var selected = Array.slice(this.doc.getElementsByClassName('selected'));
		
		if(!selected.length) return this.dialog(btoa('項目を選択して下さい.'));
		
		var content = selected[0].firstChild.textContent +
			( (selected.length > 1) ? ' とその他' + (selected.length - 1) + '個のフィルター' : ' ' ) + 
			  'を本当に削除しますか？';
		
		//削除時にインデックスがずれるのを防ぐために、反転してインデックスが降順になるようにする
		selected.reverse();
		
		this.dialog(btoa(content), function(){
			selected.forEach(function(item){
				var listType = this.win.location.href.match(/#([^#]+)$/)[1];
				var filterType = item.parentNode.parentNode.id.match(/-(\d+)\s*/)[1] - 0;
				var itemNum = item.className.match(/-(\d+)\s*/)[1] - 0;

				adblockSharp[listType].delete(filterType, itemNum);
				this.update();
				
			}, this);
		});
		
		adblockSharp.save();
	},
	
	changeFilter: function(event){
		var selected;
		
		//ダブルクリックの時はイベントのターゲットを、
		//そうでないとき（メニューから呼ばれた時）は選択されている項目を処理対象にする
		if(event.type === 'dblclick'){
			
			selected = [event.currentTarget];
		
		}else{
			selected = Array.slice(this.doc.getElementsByClassName('selected'));
			
			if(!selected.length) return this.dialog(btoa('項目を選択して下さい.'));
			if(selected.length > 1) return this.dialog(btoa('2つ以上の項目の同時編集は出来ません.'));
		}
		
		
		var td = selected[0].firstChild;
		var filter = td.textContent;
		
		if(!filter) return;
		
		//編集ボックスを作成
		selected[0].setAttribute('data-filter-original', filter);
		td.innerHTML = '';
		var editbox = this.createNode('input', { 'type': 'text', 'class': 'filter-editbox', 'value': filter }, td);
		
		//エンターが押されたら編集状態を終了する
		var that = this;
		editbox.addEventListener('keydown', function(event){
			if(event.keyCode !== 13) return;
			
			that._finishEditingFilter();
		}, false);
	},
	
	_finishEditingFilter: function(event){
		var editing = Array.slice(this.doc.getElementsByClassName('filter-editbox'));
		
		editing.forEach(function(editbox){
			var tr = editbox.parentNode.parentNode;
			var td = editbox.parentNode;
			var listType = this.win.location.href.match(/#([^#]+)$/)[1];
			var filterType = tr.parentNode.parentNode.id.match(/-(\d+)\s*/)[1] - 0;
			var itemNum = tr.className.match(/-(\d+)\s*/)[1] - 0;
			var originalFilterStr = tr.getAttribute('data-filter-original');
			
			td.removeChild(editbox);
			
			if(originalFilterStr === editbox.value || /^\s*$/.test(editbox.value)){
				td.appendChild(this.doc.createTextNode(originalFilterStr));
			}else{
				td.appendChild(this.doc.createTextNode(editbox.value));
				
				adblockSharp[listType].delete(filterType, itemNum);
				adblockSharp[listType].add(editbox.value);
			}
		}, this);
	},
	
	addFilter: function(event){
		var content = btoa("" +
			"以下に追加するフィルタを入力して下さい.<br />\
			<textarea class='dialog-textarea' rows='10' cols='80'></textarea><br />\
			<label><input type='checkbox' class='whitelist-without-atmark' /> @@なしでもホワイトリストとして処理する</label>");
		
		this.dialog(content, function(dialog){
			var inputData = dialog.getElementsByClassName("dialog-textarea")[0].value;
			var forceWhitelist = dialog.getElementsByClassName('whitelist-without-atmark')[0].checked;
		
			var filtersToAdd = inputData.split(/[\n\r]/).filter(function(item){ return item.length || !item.search(/^[\n\r\s]*$/); });
			
			if(forceWhitelist){
				filtersToAdd = filtersToAdd.map(function(item){
					return (item.lastIndexOf('@@', 0) !== -1) ?
								item.substring(2) :
								item;
				});
				
				adblockSharp.whiteList.add(filtersToAdd);
			}else{
				var blackList = filtersToAdd.filter(function(item){
					return item.lastIndexOf('@@', 0) === -1;
				});
				
				var whiteList = filtersToAdd.filter(function(item){
					return item.lastIndexOf('@@', 0) !== -1;
				}).map(function(item){
					return item.substring(2);
				});
				
				adblockSharp.blackList.add(blackList);
				adblockSharp.whiteList.add(whiteList);
			}
			
			this.update();
		});
	},
	
	optimize: function(){
		adblockSharp.blackList.optimize();
		adblockSharp.whiteList.optimize();
		this.update();
		adblockSharp.save();
	},
	
	applyPreference: function(){
		var prefs = Array.slice(this.doc.querySelectorAll('[id^="pref-"]'));
		
		prefs.forEach(function(pref){
			var key = pref.id.replace('pref-', '');
			
			if(pref.type === 'checkbox')
				setPref(key, pref.checked);
			else
				setPref(key, pref.value);
		}, this);
	},
	
	dialog: function(mes, okCallback, ngCallback){
		//wrapperを表示させる
		var wrapper = this.$('dialog-wrapper');
		wrapper.style.display = 'block';
		wrapper.style.width = this.win.innerWidth + 'px';
		wrapper.style.height = this.win.innerHeight + 'px';
		
		//dialogを作成する
		var dialog = this.createNode('div', { 'class': 'dialog' }, wrapper);
		
		//内容を追加
		this.createNode('div', { 'class': 'dialog-message-container', ':child': mes }, dialog);
		
		//Cancel, OKボタンを追加
		var buttonWrapper = this.createNode('div', { 'class': 'dialog-button-wrapper' }, dialog);
		var cancel = this.createNode('button', { 'class': 'dialog-button', ':context': btoa('Cancel') }, buttonWrapper);
		var ok = this.createNode('button', { 'class': 'dialog-button', ':context': 'OK' }, buttonWrapper);
		
		var that = this;
		
		cancel.addEventListener('click', function(){
			wrapper.removeChild(dialog);
			wrapper.style.display = 'none';
			
			if(ngCallback) ngCallback.call(that, dialog);
		}, false);
		
		ok.addEventListener('click', function(){
			wrapper.removeChild(dialog);
			wrapper.style.display = 'none';
			
			if(okCallback) okCallback.call(that, dialog);
		}, false);
		
		//大きさを適切なサイズに変更する
		var div = this.createNode('div', { ':child': mes, 'class': 'dialog-size-judgement' }, this.doc.body);
		var rect = div.getBoundingClientRect();
		var width = rect.right - rect.left;
		var height = rect.bottom - rect.top;
		
		dialog.style.width = width + 'px';
		dialog.style.height = height + 'px';
		
		this.doc.body.removeChild(div);
		
		//中央に表示させる
		dialog.style.top = (this.win.innerHeight / 2 - height / 2) + 'px';
		dialog.style.left = (this.win.innerWidth / 2 - width / 2) + 'px';
	},
	
};



/* *** Utility Functions *** */
function log(){
	var args = Array.slice(arguments);
	args.unshift('[adblock#]');
	
	Application.console.log(args.join(' '));
}

function formatDate(time){
	var f = function(n){
		return String(n).length == 1 ? '0' + n : n;
	}
	
	var date = new Date(time);
//	return date.toLocaleString();
	return date.getFullYear() + '/' + f(date.getMonth() + 1) + '/' + f(date.getDate()) + ' ' + 
			f(date.getHours()) + ":" + f(date.getMinutes()) + ":" + f(date.getSeconds()); 
}

function btoa(octets){
	return decodeURIComponent(escape(octets));
}

function setPref(key, value){
	var type = typeof value;
	
	switch(type){
	
		case 'string':
			return pref.setCharPref(key, value);
			
		case 'number':
			return pref.setIntPref(key, Math.floor(value));
			
		case 'boolean':
			return pref.setBoolPref(key, value);
			
		default:
			log('Fail to set preference:', key, JSON.stringify(value));
			return;
	}
}

function getPref(key){
	var type = pref.getPrefType(key);
	
	switch(type){
	
		case pref.PREF_STRING:
			return pref.getCharPref(key);
			
		case pref.PREF_INT:
			return pref.getIntPref(key);
			
		case pref.PREF_BOOL:
			return pref.getBoolPref(key);
			
		case pref.PREF_INVALID:
			return null;
			
		default:
			return null;
	}
}

function getRequesterWindow(aRequest){
	if(aRequest.notificationCallbacks){
		try{
			return aRequest.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
		}catch(ex){}
	}
	
	if(aRequest.loadGroup && aRequest.loadGroup.notificationCallbacks){
		try{
			return aRequest.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
		}catch(ex){}
	}
	
	return null;
}

})();


adblockSharp.init();