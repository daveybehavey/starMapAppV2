const fs=require('node:fs');
(async()=>{
 const products=[];
 for(const id of [1,2,3]){
  const url='https://api.printful.com/products/'+id;
  const response=await fetch(url);const data=await response.json();
  const variants=data.result.variants.filter(v=>/^(12″×12″|14″×14″|16″×16″|18″×18″|20″×20″|24″×24″|12″×16″|16″×20″|18″×24″)$/.test(v.size)).map(v=>({id:v.id,size:v.size,color:v.color,price:v.price,in_stock:v.in_stock,regions:v.availability_regions}));
  products.push({url,httpStatus:response.status,id,name:data.result.product.title,currency:data.result.product.currency,variants});
 }
 const fx=await (await fetch('https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1')).json();
 const evidence={fetchedAt:new Date().toISOString(),products,fx:fx.observations};
 fs.writeFileSync(require('node:path').join(__dirname,'519-public-catalog-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e.message);process.exit(1)});
