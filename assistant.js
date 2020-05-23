const grpc = require('grpc');
const protoFiles = require('google-proto-files');
const protoLoader = require('@grpc/proto-loader');
const GoogleAuth = require('google-auth-library');

//Load proto file with @grpc/proto-loader
const PROTO_ROOT_DIR = protoFiles.getProtoPath('..');
const packageDefinition = protoLoader.loadSync("google/assistant/embedded/v1alpha2/embedded_assistant.proto", {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT_DIR]
});

//Define embedded_assistant_pb from proto loader result
const embedded_assistant_pb = grpc.loadPackageDefinition(packageDefinition).google.assistant.embedded.v1alpha2;

function loadAssistant() {
    //Get assistant client from authentication information stored in local storage
    credentials = {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: window.localStorage.refreshToken,
        type: "authorized_user"
    };
    
    //Create authentication and assistant client
    sslCreds = grpc.credentials.createSsl();
    // https://github.com/google/google-auth-library-nodejs/blob/master/ts/lib/auth/refreshclient.ts
    auth = GoogleAuth;
    refresh = new auth.UserRefreshClient();
    refresh.fromJSON(credentials);
    callCreds = grpc.credentials.createFromGoogleCredential(refresh);
    combinedCreds = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);
    client = new embedded_assistant_pb.EmbeddedAssistant("embeddedassistant.googleapis.com", combinedCreds);
}

//Store active assistant audio here so it can be stopped if a request is recieved before the audio finishes playing
var activeAssistantAudio = new Audio();

function assist(input) {
    //Stop any currently playing audio
    activeAssistantAudio.pause();

    //Get assistant request object
    request = {
        config: {
            text_query: input,
            audio_out_config: {
                encoding: "OPUS_IN_OGG",
                sample_rate_hertz: 16000,
                volume_percentage: 100
            },
            dialog_state_in: {
                language_code: "en-US"
            },
            device_config: {
                device_id: window.localStorage.deviceInstance,
                device_model_id: DEVICE_MODEL_ID
            },
            screen_out_config: {
                screen_mode: "PLAYING"
            }
        }
    };

    //Create conversation
    const conversation = client.assist();

    return new Promise((resolve, reject) => {
        //Final response object
        let response = { audio: "", screen: "" };

        conversation.on('data', (data) => {
            if (data.device_action) { //Store device action to the final response object
                response.deviceAction = JSON.parse(data.device_action.device_request_json);
            }

            if (data.dialog_state_out !== null && data.dialog_state_out.supplemental_display_text) { //Store display text to final response object
                response.text = data.dialog_state_out.supplemental_display_text;
            }

            if (data.audio_out !== null) { //Add audio data to final response object (this data is delivered in chunks)
                response.audio += String.fromCharCode.apply(null, data.audio_out.audio_data);
            }

            if (data.screen_out !== null) { //Add screen data to final response object (this data is delivered in chunks)
                response.screen += bytesToString(data.screen_out.data);
            }
        });

        conversation.on('end', (error) => {
            //Conversation has ended, parse response data and resolve results

            if (response.screen) {
                //Parse screenHTML
                screenHTML = $(response.screen.replace(/Â Â·Â/g, "&nbsp;&middot;").replace(/&/g, "&amp;"));

                //Get screen text
                if (screenHTML.find(".show_text_container")[0] && !response.text) {
                    response.text = decodeURIComponent(escape(screenHTML.find(".show_text_container").text())).trim();
                }

                //Get suggestions
                var suggestions = [];
                for (element of screenHTML.find("#assistant-scroll-bar .suggestion")) {
                    suggestions.push($(element).text().trim());
                }
                response.suggestions = suggestions;

                //Format screenHTML
                screenHTML.find("script").remove();
                screenHTML.find("#assistant-main-cards .MB9zgf").wrapAll("<div id='gassist-weather-days' />");
                screenHTML.find(".BmP5tf").append(screenHTML.find("#gassist-weather-days"));
                screenHTML.find("#assistant-bar").remove();
                var result = appendCSS(screenHTML.find("#assistant-main-cards").html());
                response.screen = "data:text/html;base64," + btoa(result);
            }

            //Play response audio
            if (response.audio) {
                response.audio = "data:audio/ogg;codecs=opus;base64," + btoa(response.audio);
                activeAssistantAudio = new Audio(response.audio);
                activeAssistantAudio.play();
            }

            //Log response for debugging
            console.log("Assistant response: ", response);

            //Resolve response
            resolve(response);
        });

        conversation.on('error', (error) => {
            console.error(error);
        });

        //Write request object to the conversation
        conversation.write(request);
    })
}

//Converts byte array to string
function bytesToString(array) {
    var result = "";
    for (var i = 0; i < array.length; i++) {
        result += String.fromCharCode(array[i]);
    }
    return result;
}

//Adds some extra CSS to the screen output
function appendCSS(html) {
    return `<style>
        div {
            font-family: 'Roboto',arial,sans-serif;
        }
        #assistant-card-content {
            text-align: center;
        }
        #gassist-weather-days > div {
            display: inline-block;
        }
        .YDZ6Rb, .YDZ6Rb *, .Qc4Zr, .Qc4Zr * {
            display: inline-block !important;
            text-align: center;
        }
        .Qc4Zr, .Qc4Zr * {
            vertical-align: middle;
        }
        .Qc4Zr {
            margin: 50px 0px;
        }
        .BmP5tf {
            padding: 0px !important;
        }
        .MB9zgf:nth-child(1) {
            padding-left: 0px;
        }
        .awKLZe {
            overflow: auto !important;
        }
        #tv_knowledge_panel_image {
            display: none;
        }
        .AOjJcc {
            margin: 0px !important;
            width: auto !important;
        }
      </style>` + html.replace(/&amp;/g, "&");
}