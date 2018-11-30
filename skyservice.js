'use strict';

// Activity log.
function log(message) {
  console.log(message);
}
var apiManager = null;
var conversation = null;
var RingTone = function () {
  var _play = function () {
    var audio = document.getElementById("audio");
    audio.currentTime = 0;
    audio.play();
    audio.addEventListener('ended', function () {
      this.currentTime = 0;
      this.play();
    }, false);

  };

  var _stop = function () {
    var audio = document.getElementById("audio");
    audio.pause();
  };


  return {
    play: _play,
    stop: _stop
  };
}


angular.module('app').service('SkypeService', function ($rootScope, $window, alertFactory,
   modalFactory, Restangular, $timeout, $localStorage, $cookieStore, videoCallingService) {

  this.scope = $rootScope.$new();
  var _this = this;
  _this.config = {
    clientid: '6fb06d6b-4fb5-49e2-aac6-683c6034caea',
    apiKey: 'a42fcebd-5b43-4b89-a065-74450fb91255', // SDK
    apiKeyCC: '9c967f6b-a846-4df2-b43d-5167e47d81e1', // SDK+UI
    appName: 'trudocsfb'
  }
  _this.scope.patientAcceptCall = false;
  var restCall = Restangular.all('calls');


  _this.scope.incommingCall = function (data) {
    $rootScope.user.calling_availability = 0;
    $localStorage.user = $rootScope.user;
    $cookieStore.put('user', $rootScope.user);
    _this.scope.caller = data;
    _this.scope.acceptIncommingCall = false;
    _this.scope.declineIncommingCall = false;
    ringTone = new RingTone();
    ringTone.play();
    var modalOptions = {
      "title": "Incoming Call",
      "templateUrl": 'app/video/skype/views/incoming-call.tpl.html?v=1484658773232',
      "keyboard": false,
      "backdrop": 'static',
      "scope": _this.scope
    };
    _this.scope.incomingCallModal = modalFactory.customModal(modalOptions);
  }


  _this.scope.answerCall = function (meetirng_uri) {
    var isIE = /*@cc_on!@*/false || !!document.documentMode;
    var isEdge = !isIE && !!window.StyleMedia;
    _this.scope.acceptIncommingCall = true;
    var internalCall = (isEdge || isIE) ? true : false;
    ringTone.stop();
    restCall.all('logs/answer').post({
      'call_id': _this.scope.caller.call_id,
      'meetirng_uri': meetirng_uri,
      'internal_call': internalCall
    }).then(function (response) {
      _this.scope.patientName = _this.scope.caller.first_name + ' ' + _this.scope.caller.last_name;
      if (internalCall) {
        _this.scope.caller.discover_url = response.data.discover_url;
        _this.scope.caller.token = response.data.token;
        _this.scope.caller.conference_id = response.data.conference_id
        var modalOptions = {
          "title": "Incoming Call",
          "templateUrl": 'app/video/skype/views/call.tpl.html?v=1484658773232',
          "keyboard": false,
          "backdrop": 'static',
          "scope": _this.scope
        };
        _this.scope.runningCallModal = modalFactory.customModal(modalOptions);
        _this.scope.initializeSkypeSdk();
        console.log("wait for join the call");

      } else {
        $window.open(meetirng_uri, '_blank');
      }
      /* START TO SAVE INCOMING DATA TO LOCAL STORAGE */
      videoCallingService.saveIncomingCallDataToLocalstorage(_this.scope.caller, 'video', 'Skype');
    });
    _this.scope.incomingCallModal.destroy();
    if(internalCall) {
      document.getElementById('backgroundTrans').style.display = 'block';
    }
  }

  _this.scope.makeCall = function (data) {

    $timeout(function () {
      if (!_this.scope.patientAcceptCall) {
        // send log no answer to call
        Restangular.all('calls').all('logs/no_answer').post({
          'call_id': _this.scope.caller.call_id,
          'source': 'patient'
        }).then(function (response) {
          console.log("wait for join the call");
        });
        _this.scope.dropCall();
      }
    }, 1000 * 60 * 2);


  }

  _this.scope.declineCall = function () {
    $rootScope.user.calling_availability = 1;
    $localStorage.user = $rootScope.user;
    $cookieStore.put('user', $rootScope.user);
    ringTone.stop();
    _this.scope.declineIncommingCall = true;
    restCall.all('logs/decline').post({
      'call_id': _this.scope.caller.call_id,
      'source': 'agent'
    }).then(function (response) {
      console.log("decline call");
    });
    _this.scope.incomingCallModal.destroy()
  }

  _this.scope.closeCall = function () {
    ringTone.stop();
    if (_this.scope.incomingCallModal) {
      _this.scope.incomingCallModal.destroy();
    }
  }

  _this.scope.initializeSkypeSdk = function () {
    Skype.initialize({ apiKey: _this.config.apiKeyCC }, function (api) {
      console.log("before app");
      apiManager = api;
      var app = api.UIApplicationInstance;
      console.log('SdKStatus', 'Skype Web SDK & Conversation Control Initialize success!');

      //Event handler: whenever app state changes, display its value
      app.signInManager.state.changed(function (state) {
        console.log('state');
        console.log({ state });
      });

      console.log(_this.scope.caller.discover_url);
      app.signInManager.signIn({
        name: $rootScope.user.name,
        cors: true,
        root: { user: _this.scope.caller.discover_url },
        auth(req, send) {
          if (req.url != _this.scope.caller.discover_url)
            req.headers['Authorization'] = "Bearer " + _this.scope.caller.token;
          return send(req);
        }
      }, err => {
        console.log("can't sign in ", err);
      }).then(() => {
        var conversationsManager = app.conversationsManager;
        conversation = conversationsManager.conversations(0);
        var input = _this.scope.caller.conference_id;
        var container = document.getElementById(input);
        if (!container) {
          container = document.createElement('div');
          container.id = input;
          document.getElementById("videos").appendChild(container);
        }

        apiManager.renderConversation(container, {
          //Start outgoing call with chat window
          conversation: conversation,
          modalities: ['video', 'audio'],
          conversationId: input
        });
        // var sipConversation = conversationsManager.conversations(0);
        //console.log('conversation', conversation);

        conversation.selfParticipant.video.state.when('Connected', function () {
            document.getElementById('loader').style.display = 'none';
          // video is availabe ... lets assign a container.

          // formats include: 'Stretch', 'Fit' and 'Crop'
          conversation.selfParticipant.video.channels(0).stream.source.sink.format('Stretch');
          conversation.selfParticipant.video.channels(0).stream.source.sink.container(document.getElementById("previewWindow"));
          // the video will be rendered automatically

          conversation.participants.added(function (person) {
            // person.displayName() has joined the conversation

            // lets add another listener for the joined person that notifies us when they add video
            person.video.state.when('Connected', function () {
              // lets assign a container.

              // formats include: 'Stretch', 'Fit' and 'Crop'
              person.video.channels(0).stream.source.sink.format('Stretch');
              person.video.channels(0).stream.source.sink.container(document.getElementById("conversationWindow"));

              // register a listener to know when the video is available
              person.video.channels(0).isVideoOn.changed(function (isVideoOn) {
                // turn on/off video
                person.video.channels(0).isStarted(isVideoOn);

                // NOTE: .isStarted() only needs to be called for remote participants in group conversations
                // it dictates wether or not the participant's video should be rendered
              });
            });
          });

          conversation.participants.removed(function () {
            // console.log(conversation.participantsCount.get('value'));
            // console.log(" yasta dol "+conversation.participantsCount.get+" partisipant")
            // if(conversation.participantsCount.get == 0 ) {
              conversation.leave();
//              _this.scope.dropCall();
            // }
          });


        });

        conversation.state.changed(function (newValue, reason, oldValue) {
          if (newValue === 'Disconnected' && (oldValue === 'Connected' || oldValue === 'Connecting' || oldValue === 'Conferenced' || oldValue === 'Conferencing')) {
            conversation.leave();
            _this.scope.dropCall();
          }
        });
        conversation.selfParticipant.video.state.changed(function (newState, reason, oldState) {
          if (newState === 'Disconnected' && (oldState === 'Connected' || oldState === 'Connecting' || oldState === 'Conferenced' || oldState === 'Conferencing')) {
            conversation.leave();
          }
        });


        // conversation.participants.add('sip:xxx');
        // conversation.participants.add('sip:yyy');

        // starting the video conference
        conversation.videoService.start().then(null, function (error) {
          // handle error
        });

      });
      app.signInManager.state.changed(function (state) {
        console.log(state);
      });
      console.log("after app");


    }, err => {
      console.log("cannot load the sdk package", err);
    });
  }

  _this.scope.dropCall = function () {
    if(conversation) {
      console.log("leave conversation");
      conversation.leave();
    }
    _this.scope.callDropped = true;
    _this.scope.runningCallModal.destroy();
    // angular.element("#dialog").dialog("destroy");
    restCall.all('logs/leave').post({
      'call_id': _this.scope.caller.call_id
    }).then(function (response) {
      _this.scope.caller = null;
    });
  }

});
