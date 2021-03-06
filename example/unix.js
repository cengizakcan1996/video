// Generated by CoffeeScript 1.12.6
(function() {
  var AUDIO_CONTROL_PATH, AUDIO_DATA_PATH, INPUT_FILE, STREAM_NAME, VIDEO_CONTROL_PATH, VIDEO_DATA_PATH, aac, audioControlSocket, audioDataSocket, checkEnd, h264, isAudioEnded, isVideoEnded, mpegts, net, sendAudioStart, sendVideoStart, videoControlSocket, videoDataSocket;

  net = require('net');

  h264 = require('../h264');

  aac = require('../aac');

  mpegts = require('../mpegts');

  INPUT_FILE = "test.ts";

  STREAM_NAME = "myStream";

  VIDEO_CONTROL_PATH = '/tmp/node_rtsp_rtmp_videoControl';

  AUDIO_CONTROL_PATH = '/tmp/node_rtsp_rtmp_audioControl';

  VIDEO_DATA_PATH = '/tmp/node_rtsp_rtmp_videoData';

  AUDIO_DATA_PATH = '/tmp/node_rtsp_rtmp_audioData';

  videoControlSocket = null;

  audioControlSocket = null;

  videoDataSocket = null;

  audioDataSocket = null;

  isVideoEnded = false;

  isAudioEnded = false;

  checkEnd = function() {
    if (isVideoEnded && isAudioEnded) {
      aac.close();
      videoControlSocket.end();
      audioControlSocket.end();
      videoDataSocket.end();
      audioDataSocket.end();
      return console.log("all done");
    }
  };


  /*
  Packet format
  
  packet {
    payload_size (3 bytes)  Length of this packet excluding payload_size, in uint24.
    packet_type (1 byte)    Type of this packet.
    if (packet_type == 0) { // video start: notify the start of video stream
      // No data after packet_type
    } else if (packet_type == 1) { // audio start: notify the start of audio stream
      // No data after packet_type
    } else if (packet_type == 2) { // video data
      PTS (6 bytes)              PTS in uint48. DTS has the same value.
      payload (remaining bytes)  One or more NAL units with start code prefix.
    } else if (packet_type == 3) { // audio data
      PTS (6 bytes)              PTS in uint48. DTS has the same value.
      payload (remaining bytes)  One or more ADTS frames containing AAC raw data.
    }
  }
   */

  sendVideoStart = function() {
    var buf, e, payloadSize, streamNameBuf;
    console.log("send video start");
    streamNameBuf = new Buffer(STREAM_NAME, 'utf8');
    payloadSize = 1 + streamNameBuf.length;
    buf = new Buffer([(payloadSize >> 16) & 0xff, (payloadSize >> 8) & 0xff, payloadSize & 0xff, 0x00]);
    buf = Buffer.concat([buf, streamNameBuf], 4 + streamNameBuf.length);
    try {
      return videoControlSocket.write(buf);
    } catch (error) {
      e = error;
      return console.log("video start write error: " + e);
    }
  };

  sendAudioStart = function() {
    var buf, e, payloadSize;
    console.log("send audio start");
    payloadSize = 1;
    buf = new Buffer([(payloadSize >> 16) & 0xff, (payloadSize >> 8) & 0xff, payloadSize & 0xff, 0x01]);
    try {
      return audioControlSocket.write(buf);
    } catch (error) {
      e = error;
      return console.log("audio start write error: " + e);
    }
  };

  h264.on('dts_nal_units', function(pts, dts, nalUnits) {
    var buf, concatNALUnit, e, i, len, nalUnit, nalUnitTypes, nalUnitsWithStartCode, payloadSize;
    nalUnitTypes = [];
    nalUnitsWithStartCode = [];
    for (i = 0, len = nalUnits.length; i < len; i++) {
      nalUnit = nalUnits[i];
      nalUnitTypes.push(nalUnit[0] & 0x1f);
      nalUnitsWithStartCode.push(new Buffer([0x00, 0x00, 0x00, 0x01]));
      nalUnitsWithStartCode.push(nalUnit);
    }
    concatNALUnit = Buffer.concat(nalUnitsWithStartCode);
    payloadSize = concatNALUnit.length + 7;
    buf = new Buffer([(payloadSize >> 16) & 0xff, (payloadSize >> 8) & 0xff, payloadSize & 0xff, 0x02, (pts / 0x10000000000) & 0xff, (pts / 0x100000000) & 0xff, (pts / 0x1000000) & 0xff, (pts / 0x10000) & 0xff, (pts / 0x100) & 0xff, pts & 0xff]);
    buf = Buffer.concat([buf, concatNALUnit]);
    console.log("send video: pts=" + pts + " dts=" + dts + " len=" + concatNALUnit.length + " nal_unit_types=" + (nalUnitTypes.join(',')));
    try {
      return videoDataSocket.write(buf);
    } catch (error) {
      e = error;
      return console.log("video write error: " + e);
    }
  });

  aac.on('dts_adts_frames', function(pts, dts, adtsFrames) {
    var buf, concatADTSFrame, e, payloadSize;
    concatADTSFrame = Buffer.concat(adtsFrames);
    payloadSize = concatADTSFrame.length + 7;
    buf = new Buffer([(payloadSize >> 16) & 0xff, (payloadSize >> 8) & 0xff, payloadSize & 0xff, 0x03, (pts / 0x10000000000) & 0xff, (pts / 0x100000000) & 0xff, (pts / 0x1000000) & 0xff, (pts / 0x10000) & 0xff, (pts / 0x100) & 0xff, pts & 0xff]);
    buf = Buffer.concat([buf, concatADTSFrame]);
    console.log("send audio: pts=" + pts + " dts=" + pts + " len=" + concatADTSFrame.length);
    try {
      return audioDataSocket.write(buf);
    } catch (error) {
      e = error;
      return console.log("audio write error: " + e);
    }
  });

  mpegts.on('video', function(pesPacket) {
    return h264.feedPESPacket(pesPacket);
  });

  mpegts.on('audio', function(pesPacket) {
    return aac.feedPESPacket(pesPacket);
  });

  h264.on('end', function() {
    console.log("end of video stream");
    isVideoEnded = true;
    return checkEnd();
  });

  aac.on('end', function() {
    console.log("end of audio stream");
    isAudioEnded = true;
    return checkEnd();
  });

  mpegts.on('end', function() {
    console.log("EOF");
    h264.end();
    return aac.end();
  });

  mpegts.open(INPUT_FILE);

  videoControlSocket = net.createConnection(VIDEO_CONTROL_PATH, function() {
    return audioControlSocket = net.createConnection(AUDIO_CONTROL_PATH, function() {
      return videoDataSocket = net.createConnection(VIDEO_DATA_PATH, function() {
        return audioDataSocket = net.createConnection(AUDIO_DATA_PATH, function() {
          sendVideoStart();
          sendAudioStart();
          return mpegts.startStreaming(0);
        });
      });
    });
  });

}).call(this);
