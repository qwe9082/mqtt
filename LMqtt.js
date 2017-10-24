/** 名称: Mqtt类
 */
var LMqtt=new function()
{
	var me=this;
	
	this.status= 0;
	this.client=null;
	
	this.topic_class= '';
	this.topic_my= '';
	this.client_id= '';
	
	this.cfg= {
		 host: ""
		,port: ""
		,userName: "test"
		,password: "test"
		
		,connect_id_prefix: "iclass/class"
		,cleanSession: true
		,keepAliveInterval: 5
	};
	
	var _Stop= false;
	
	/**执行连接*/
	this.on_connect= function( class_id, subject_id, user_id, succ )
	{
		me.cfg.host= DApp.cfg_mqtt.mqtt_host;
		me.cfg.port= Number(DApp.cfg_mqtt.mqtt_port_http);
		me.cfg.userName= DApp.cfg_mqtt.mqtt_user;
		me.cfg.password= DApp.cfg_mqtt.mqtt_pass;
		
		me.topic_class= me.cfg.connect_id_prefix+'/'+class_id + '_' +user_id;
		me.topic_my= "iclass/user/"+user_id;
		
		me.client_id= "t" + user_id + "_" + HTxt.uuid().substr(0,4) ;
		me.client = new Paho.MQTT.Client( me.cfg.host, me.cfg.port, me.client_id);
		
		//绑定事件
		me.client.onConnectionLost = me.onConnectionLost ;
		me.client.onMessageArrived = me.onMessageArrived ;
		
		me._connect( succ );
	};
	
	this._connect= function( succ )
	{
		//连接参数
		var options = {
			 userName : me.cfg.userName
			,password : me.cfg.password
			,cleanSession : me.cfg.cleanSession
			,keepAliveInterval : me.cfg.keepAliveInterval
			,onSuccess : function()
			{
				console.log( HTime.date() + ' connected' );
				//me.client.subscribe(me.topic_class);
				me.client.subscribe(me.topic_my,{qos:1});
				me.on_sendMessage(me.topic_my, '{"class":"report","params":{"action":"login","client_id":"'+me.client_id+'"}}', function(){});
				
				succ && succ();
				me.status=1;
				console.log(me.topic_class +' 已连接!' );
				
				HToast.toast("连接成功！",2000);
				
				//点下名
				me.send_query_online();
			}
			,onFailure : function(e)
			{
				console.log(me.topic_class + '连接失败');
				
				HToast.toast("连接失败，尝试重连！",1000);
				setTimeout(function(){me._connect(); },3000);
			}
		};
		console.log('mqtt connect options',options);
		
		try{
			me.client.connect(options);
		}catch(e){	
			HToast.toast("连接失败，尝试重连！",1000);
			setTimeout(function(){me._connect(); },3000);
		}
	};
	/**连接断开*/
	this.onConnectionLost= function(responseObject)
	{
		if (responseObject.errorCode !== 0) {
			var msg=HTime.date()+" onConnectionLost: " + responseObject.errorMessage;
			console.log(msg);
		}
		me.status=0;
		
		HToast.toast("连接断开，尝试重连！",1000);
		setTimeout(function(){me._connect(); },3000);
	};
	
	/**取url地址，获取在线学生列表用的*/
	this.get_url_online=function()
	{
		if( me.cfg.host )
		{
			var url= DApp.cfg_mqtt.mqtt_api_onlines+"/online/?classtopic=mqtt_classtopic_stuclient:"+me.topic_class;
			return url;
		}else{
			return '';
		}
	};
	
	/**点名*/
	this.send_query_online=function()
	{
		DApp.online_clients= {};
		var url= DApp.cfg_mqtt.mqtt_api_onlines+"/online/?classtopic=mqtt_classtopic_stuclient:"+me.topic_class;
		$.getJSON( url,function(d){
			if(d.status==1){
				$.each(d.recordset.split('|'),function(i,client_id){
					if(client_id){
						var userid= parseInt(client_id.split("_")[0].substr(1));
						DApp.mqtt_students[userid].online.push( client_id );
					}
				});
			}
		});
	};
	
	/**执行发送消息*/
	this.on_sendMessage= function( topic, msg , succ )
	{
		var send= function()
		{
			var message = new Paho.MQTT.Message(msg);
			message.destinationName = topic;
			me.client.send(message);
			console.log('MQ_MSG',topic,msg);
		    
		    succ && succ();
		}
		if( me.status ){
			send();
		}else{
			setTimeout(function(){send();},2000);
		}
	};
	
	/**发送指令*/
	this.on_sendCommand=function(target,command)
	{
		//全班的
		if( target.type=='class' ){
			me.on_sendMessage(me.topic_class, JSON.stringify(command) );
		}else{
			$.each(target.users,function(i,userid){
				me.on_sendMessage("iclass/user/"+userid, JSON.stringify(command) );	
			});
		}
		
		//记录到状态恢复指令
		if( $.inArray(command.params.action,[
			 'start_class'
			,'start_task','end_task'
			,'lock_screen','unlock_screen'
			,'screen_sync_start','screen_sync_stop'
			,'rush_ready','rush_start','rush_stop'
			,'vote_start','vote_stop'
		])>=0 )
		{
			//全班的
			if( target.type=='class' ){
				$.each(DApp.mqtt_students,function(userid,val){
					DApp.mqtt_students[userid].scommand= command;
				});
			}else{
				$.each(target.users,function(i,userid){
					DApp.mqtt_students[userid].scommand= command;
				});
			}
		}
	};
	
	/**开始上课发消息给mqtt工具*/
	this.start_class= function()
	{
		if( DApp.class_info.class_net_type!=2 ){
			return;
		}
		me.on_sendMessage(
			  "iclass/start_class"
			, JSON.stringify({
				 type:"start"
				,teacher_id: DApp.user_info.userid
				,class_id: DApp.class_info.class_id
				,teacher_client_id: me.client_id
				,publish_id: DApp.publish_id
			})
		);
	};
	
	/**结束上课发消息给mqtt工具*/
	this.end_class=function()
	{
		if( DApp.class_info.class_net_type!=2 ){
			return;
		}
		me.on_sendMessage(
			  "iclass/start_class"
			, JSON.stringify({
				 type:"end"
				,teacher_id: DApp.user_info.userid
				,class_id: DApp.class_info.class_id
				,teacher_client_id: me.client_id
				,publish_id: DApp.publish_id
			})
		);
	};
	
	/**收到消息处理*/
	this.onMessageArrived= function(message)
	{
		console.log(message);
		console.log('mqtt',message.payloadString);
		
		//消息所在的频道名称
		//alert(message.destinationName);
		try{
			var command= JSON.parse(message.payloadString);
		}catch(e){
			var command= {};
		}
		
		//参数基本格式正确
		if( command.class && command.params )
		{
			var params= command.params;
			if( command.class=='report' )
			{
				switch( params.action )
				{
					case 'stu_report_stu_online':	//学生上线告诉老师 {"class": "report","params": {"action": "stu_report_stu_online","client_id":""} }
						if( params.client_id ){
							var userid= parseInt(params.client_id.split("_")[0].substr(1));
							DApp.mqtt_students[userid].online.push( params.client_id );
							
							if( DApp.mqtt_students[userid].scommand ){
								console.log("last command send"+ JSON.stringify(DApp.mqtt_students[userid].scommand) );
								me.on_sendMessage("iclass/user/"+userid, JSON.stringify(DApp.mqtt_students[userid].scommand));
							}else{
								console.log("last command send is empty");
							}
						}
						break;
					case 'tool_report_stu_offline':	//工具告诉老师学生掉线 {"class": "report","params": {"action": "tool_report_stu_offline","client_id":""} }
						if( params.client_id ){
							var userid= parseInt(params.client_id.split("_")[0].substr(1));
							var num=0;
							do{
								var pos=-1;
								$.each(DApp.mqtt_students[userid].online,function(i,v){
									if(v==params.client_id){
										pos=i;
										return false;
									}
								});
								if(pos>=0){
									DApp.mqtt_students[userid].online.splice(pos,1);
								}else{
									break;
								}
							}while(num++<20);
						}
						break;
					case 'task_received':	//学生告诉老师已收到任务 {"class": "report","params": {"action": "task_received","client_id":"","instruction_id":"1234"} }
						if( params.client_id && params.instruction_id ){
							var userid= parseInt(params.client_id.split("_")[0].substr(1));
							
							CCmd.taskList.mqtt_received_add(userid, parseInt(params.instruction_id) );
						}
						break;
					case 'login':	//账号告诉其他账号自己上线了 {"class": "report","params": {"action": "login","client_id":""} }
						if( params.client_id ){
							if( params.client_id!=me.client_id )
							{
								alert('被踢掉了！');
							}
						}
						break;
				}
			}
		}
	};
	
};
