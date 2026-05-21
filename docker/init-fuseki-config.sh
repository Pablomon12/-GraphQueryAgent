#!/bin/sh
set -eu

mkdir -p /fuseki/configuration /fuseki/databases
cp /bootstrap/fuseki-config.ttl /fuseki/configuration/dataset.ttl

# stain/jena-fuseki runs as the `fuseki` user (uid 100).
chown -R 100:100 /fuseki
