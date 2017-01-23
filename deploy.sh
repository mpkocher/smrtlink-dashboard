#!/bin/env bash

npm run build
# I can't figure out the proper way to do this. Hence, adding this hack
sed -i .bak 's/\/static/http:\/\/web\/~mkocher\/apps\/smrtlink-dashboard\/static/g' build/index.html
cd build
scp -r . mkocher@login14-biofx01:~/public_html/apps/smrtlink-dashboard
cd -
