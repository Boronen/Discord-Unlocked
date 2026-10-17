import { execFileSync } from "node:child_process";
const run = (...args) => execFileSync("iptables", args, { stdio: "inherit" });
// This namespace is shared by the decoder. No mounts, credentials or application code run here.
run("-P", "OUTPUT", "DROP");
run("-P", "INPUT", "DROP");
run("-P", "FORWARD", "DROP");
run("-A", "OUTPUT", "-o", "lo", "-j", "ACCEPT");
run("-A", "INPUT", "-i", "lo", "-j", "ACCEPT");
run("-A", "OUTPUT", "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT");
run("-A", "INPUT", "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT");
run("-A", "OUTPUT", "-p", "tcp", "-d", "172.30.0.2", "--dport", "5432", "-j", "ACCEPT");
console.log("Decoder egress restricted to the database job interface.");
setInterval(() => {}, 60_000);
