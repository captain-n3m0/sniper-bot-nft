const fs = require('fs');
fetch('https://api.etherscan.io/api?module=contract&action=getabi&address=0x00005EA00Ac477B1030CE78506496e8C2dE24bf5')
  .then(res => res.json())
  .then(data => {
     if(data.status === '1') {
       const abi = JSON.parse(data.result);
       const viewFuncs = abi.filter(i => i.type === 'function' && (i.stateMutability === 'view' || i.stateMutability === 'pure'));
       console.log(viewFuncs.map(f => f.name).join(', '));
     }
  });
