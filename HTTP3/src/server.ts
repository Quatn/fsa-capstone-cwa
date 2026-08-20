import { Http3Server } from "@fails-components/webtransport";
import { readFileSync } from "fs";
import { createHash, X509Certificate } from "crypto";

const cert = readFileSync("./cert.pem");
const key = readFileSync("./key.pem");

const h3Server = new Http3Server({
  port: 5000,
  host: "0.0.0.0",
  secret: "changeme",
  cert,
  privKey: key,
});

// print the cert hash you'll need on the client
const derCert = new X509Certificate(cert).raw;
console.log(createHash("sha256").update(derCert).digest("base64"));

(async () => {
  const stream = await h3Server.sessionStream("/wt");
  const reader = stream.getReader();

  while (true) {
    const { done, value: session } = await reader.read();
    if (done) break;

    await session.ready;
    console.log("client connected");

    const bidiReader = session.incomingBidirectionalStreams.getReader();
    const { value: bidiStream } = await bidiReader.read();
    const [readable, writable] = [bidiStream.readable, bidiStream.writable];

    const dReader = readable.getReader();
    const writer = writable.getWriter();
    const { value } = await dReader.read();
    console.log("received:", new TextDecoder().decode(value));
    await writer.write(
      new TextEncoder().encode("echo: " + new TextDecoder().decode(value)),
    );
  }
})();

h3Server.startServer();
