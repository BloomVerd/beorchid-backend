# AWS IOT core commands flow
* Backend creates commands, either one command in the system that handles iot tool calling for all farmers. (when do you create the command?)
* Backend specifies command payload (this should be from the iot tool call, example irrigate action, farmId, deviceId, toolCallId, etc, so I am guessing it should be dynamic)
* Chooses device type (all devices)
* Make sure device subscribes to commands reserved topics (Would this be in the policy or what?)
* Backend starts command execution when an iot tool call is made
* Command sends message to specific device
* Device publishes a notification to response topics (irrigation in progress | completed, pending) (backend receives it through webhook and updates iot_tool call entity)
