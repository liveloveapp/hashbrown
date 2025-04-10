import { Socket } from 'net';
import { parse } from './streaming-json-parser';

const client = new Socket();

client.connect(1337, '127.0.0.1', function () {
  console.log('Connected');
  //   client.write('Hello, server! Love, Client.');
});

client.on('data', function (data) {
  console.log('Received: ' + data);

  // Attempt to parse json
  console.log(parse(data.toString()));

  client.destroy(); // kill client after server's response
});

client.on('close', function () {
  console.log('Connection closed');
});
