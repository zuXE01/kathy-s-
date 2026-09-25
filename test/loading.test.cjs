const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('skeletons are noninteractive, hidden from assistive tech and clean up without removing loaded content',()=>{
  class Element {
    constructor(){this.children=[];this.attributes={};}
    setAttribute(key,value){this.attributes[key]=value;}
    append(child){child.parent=this;this.children.push(child);}
    replaceChildren(){this.children=[];}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  }
  const context={document:{createElement:()=>new Element()}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/loading.js'),'utf8').replace(/export /g,''),context);
  const container=new Element(),finish=context.showSkeleton(container,4);
  assert.equal(container.attributes['aria-busy'],'true');
  assert.equal(container.children.length,4);
  assert.ok(container.children.every(child=>child.attributes['aria-hidden']==='true'&&child.children.length===5));
  container.replaceChildren();const content=new Element();container.append(content);
  finish();assert.equal(container.attributes['aria-busy'],'false');assert.equal(container.children[0],content);
});
