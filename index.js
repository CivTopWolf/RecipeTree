function stringifyShallow(obj) {
  if (typeof obj !== "object") {
    return obj
  }
  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map(stringifyShallow))
  }
  return '{' + Object.keys(obj).map(k => `"${k}": ${obj[k]}`).join(', ') + '}'
}

class RecipeTree {
  constructor() {
    this.rcpSources = [];

    // TODO use Map instead
    this.factories = {}; // { "factory_key": { name, recipes:[str], upgradeRecipe } }
    this.recipes = {}; // { "recipe_key": { inFactories, name, type, input:{items}, ?output:{items}, ?factory } }
    this.items = {}; // { "item_key": { key, recipeSources, material, ?durability, ?lore:[str], ?name, ?amount } }
  }

  /*
   * rcpSource - Recipe source. Should have the following shape:
   *
   *  factories:
   *    FACTORY_KEY_1:
   *      recipes
   *        - RECIPE_KEY_1
   *        - RECIPE_KEY_2
   *    FACTORY_KEY_2:
   *      recipes
   *        - RECIPE_KEY_3
   *        - RECIPE_KEY_4
   *  recipes:
   *    RECIPE_KEY_1
   *      type:
   *      input:
   *        MATERIAL_1:
   *          material: COBBLESTONE
   *          amount: 64
   *      output:
   *        MATERIAL_2:
   *          material: STONE
   *          amount: 96
   */
  addRecipeSource(rcpSrc) {
    this.rcpSources.push(rcpSrc);
    Object.assign(this.factories, rcpSrc.factories);

    Object.assign(this.recipes, rcpSrc.recipes);
    for (let factoryKey in this.factories) {
      const factory = this.factories[factoryKey];
      for (let rcpKey of factory.recipes) {
        const recipe = this.recipes[rcpKey];
        if (!recipe) {
          console.error(`Undefined recipe ${rcpKey} in ${stringifyShallow(factory)}`);
          delete factory.recipes[rcpKey];
          continue;
        }
        recipe.key = rcpKey;
        recipe.inFactories = recipe.inFactories || [];
        recipe.inFactories.push(factory);
      }
    }

    for (let rcpKey in this.recipes) {
      const rcp = this.recipes[rcpKey];
      // Ignore downgrade recipes
      const words = rcp.name.split(" ");
      if (words[0] === 'Downgrade') {
        continue;
      }
      if (rcp.type === 'UPGRADE' && rcp.name.split(" ")[0] !== 'Downgrade') {
        const resultingFactory = Object.values(this.factories).find(f => f.name === rcp.factory);
        if (resultingFactory.upgradeRecipe) {
          throw new Error(`upgradeRecipe already set for ${stringifyShallow(rcp.factory)}: ${stringifyShallow(resultingFactory.upgradeRecipe)}`);
        } else {
          resultingFactory.upgradeRecipe = rcp;
        }
      }
      for (let rcpItem of Object.values(rcp.input || {}).concat(Object.values(rcp.output || {}))) {
        rcpItem.type = bukkitNames[rcpItem.material];
        if (!rcpItem.type) {
          if (rcpItem.material === 'REDSTONE_LAMP') rcpItem.type = bukkitNames['REDSTONE_LAMP_OFF'];
          else
          throw new Error(`Unknown material ${rcpItem.material} in recipe item ${stringifyShallow(rcpItem)} in recipe ${stringifyShallow(rcp)}`);
        }
        const meta = Math.max(0, rcpItem.durability || 0); // some are -1, some are undefined
        const itemData = itemNames.find(i => i.type === rcpItem.type && i.meta === meta)
          || itemNames.find(i => i.type === rcpItem.type);
        if (!itemData) {
          throw new Error(`Unknown item type/meta ${rcpItem} in recipe ${stringifyShallow(rcp)}`);
        }
        rcpItem.niceName = itemData.name;
        if (rcpItem.durability === -1)
          rcpItem.niceName = 'Any ' + rcpItem.niceName;

        const itemKey = getItemKey(rcpItem);
        const oldItem = this.items[itemKey];
        this.items[itemKey] = Object.assign({ recipeSources: [], }, rcpItem, oldItem);
        rcpItem.recipeSources = this.items[itemKey].recipeSources;
      }
      for (let rcpItem of Object.values(rcp.output || {})) {
        rcpItem.recipeSources.push(this.recipes[rcpKey]);
      }
    }
  }

  startApp(node) {
    return new Promise(onRef => {
      ReactDOM.render(
        <App
          factories={this.factories}
          recipes={this.recipes}
          items={this.items}
          ref={r => r && onRef(r)}
        />,
        node
      );
    });
  }

  static getUrl(url) {
    return new Promise((onData, onErr) => {
      var request = new XMLHttpRequest();
      request.open('GET', url, true);
      request.onreadystatechange = function() {
        if (this.readyState === 4) {
          if (this.status >= 200 && this.status < 400) {
            onData(this.responseText);
          } else {
            onErr(this);
          }
        }
      };
      request.send();
      request = null;
    });
  }
}
