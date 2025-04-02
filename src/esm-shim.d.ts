// esm-shim.d.ts
declare module 'https://esm.sh/lodash' {
  import _ from 'lodash';
  export default _;
}

declare module 'https://esm.sh/lodash-es' {
  import * as _ from 'lodash-es';
  export default _;
}

// Add more ESM modules as needed
declare module 'https://esm.sh/*' {
  const content: any;
  export default content;
}
