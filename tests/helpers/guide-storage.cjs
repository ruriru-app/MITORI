module.exports = function memoryStorage(entries={}) {
  const values=new Map(Object.entries(entries));
  return {
    values, get length(){return values.size;},
    key(index){return Array.from(values.keys())[index]??null;},
    getItem(key){return values.get(key)??null;},
    setItem(key,value){values.set(key,String(value));},
    removeItem(){throw new Error('guide may not delete storage');},
    clear(){throw new Error('guide may not clear storage');}
  };
};
