// Widgets are still experimental
// More: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/PWAWidgets/README.md

const periodicSync = self.registration.periodicSync;

// mocking widgets
if ( ! "widgets" in self )
{
  const WidgetsInterface = function() {
    var _widgets = [{
      definition: {
        tag: "foo",
        template: "feed",
        data: "https://www.aaron-gustafson.com/feeds/all.json",
        type: "application/json"
      },
      installable: true,
      instances: [{
        id: "foo-instance-1",
        hostId: "host-1"
      }]
    },
    {
      definition: {
        tag: "bar",
        template: "feed",
        data: "https://www.aaron-gustafson.com/feeds/latest-links.json",
        type: "application/json"
      },
      installable: true,
      instances: [{
        id: "bar-instance-1",
        hostId: "host-1"
      }]
    },
    {
      definition: {
        tag: "baz",
        template: "feed",
        data: "https://www.aaron-gustafson.com/feeds/latest-posts.json",
        type: "application/json"
      },
      installable: false,
      instances: []
    }];
    
    async function matchAll( obj )
    {
      return _widgets.filter( widget => {
        let result = true;
        if ( result && "installable" in obj ) {
          result = obj.installable === widget.installable;
        }
        if ( result && "installed" in obj ) {
          result = obj.installed ? widget.instances.length > 0
                                  : widget.instances.length === 0;
        }
        if ( result && "tag" in obj ) {
          result = widget.definition.tag === obj.tag;
        }
        if ( result && ( "hostId" in obj || "instanceId" in obj ) ) {
          result = widget.instances.find( instance => {
            if ( "hostId" in obj ) {
              return instance.hostId === obj.hostId;
            }
            else if ( "instanceId" in obj ) {
              return instance.id === obj.instanceId;
            }
          });
        }
        return result;
      });
    }
    async function getByHostId( host_id ) 
    {
      return matchAll({ hostId: host_id });
    }
    async function getByInstanceId( instance_id )
    {
      const result = await matchAll({ instanceId: instance_id });
      return Promise.resolve( result[0] );
    }
    async function getByTag( tag )
    {
      const result = await matchAll({ tag: tag });
      return Promise.resolve( result[0] );
    }
  
    // This takes the place of internal logic in the browser
    const _updateInstance = ( instance, payload ) => {
      instance.updated = Date.now();
      instance.payload = payload;
      _widgets.forEach( (_widget, w) => {
        _widget.instances.forEach( (_instance, i) => {
          if ( _instance.id === instance.id )
          {
            _widgets[w].instances[i] = instance;
          }
        });
      });
      return;
    };
    async function updateByInstanceId( instance_id, payload )
    {
      await getByInstanceId( instance_id )
        .then( widget => {
          let instance = widget.instances.find( i => i.id === instance_id );
          _updateInstance( instance, payload );
        });
    }
    async function updateByTag( tag, payload )
    {
      await getByTag( tag )
        .then( widget => {
          widget.instances.forEach(
            instance => _updateInstance( instance, payload )
          );
        });
    }
  
    async function removeByInstanceId( instance_id )
    {
      await getByInstanceId( instance_id )
        .then( widget => {
          widget.instances = widget.instances.filter( i => i.id !== instance_id );
        });
    }
    async function removeByTag( tag )
    {
      await getByTag( tag )
        .then( widget => {
          widget.instances = [];
        });
    }
  
    return {
      matchAll: matchAll,
      getByHostId: getByHostId,
      getByInstanceId: getByInstanceId,
      getByTag: getByTag,
      updateByInstanceId: updateByInstanceId,
      updateByTag: updateByTag,
      removeByInstanceId: removeByInstanceId,
      removeByTag: removeByTag
    };
  };
  self.widgets = new WidgetsInterface();
}

async function registerPeriodicSync( widget )
{
  // if the widget is set up to auto-update…
  if ( "update" in widget.definition ) {
    registration.periodicSync.getTags()
      .then( tags => {
        // only one registration per tag
        if ( ! tags.includes( widget.definition.tag ) ) {
          periodicSync.register( widget.definition.tag, {
              minInterval: widget.definition.update
          });
        }
      });
  }
  return;
}

async function  unregisterPeriodicSync( widget )
{
  // clean up periodic sync?
  if ( widget.instances.length === 1 &&
       "update" in widget.definition )
  {
    periodicSync.unregister( widget.definition.tag );
  }
  return;
}

async function createInstance( instance_id, widget )
{
  await updateInstance( instance_id, widget )
    .then(() => {
      registerPeriodicSync( widget );
    });
  return;
}

async function updateWidgets( host_id )
{
  const config = host_id ? { hostId: host_id }
                         : { installed: true };
  
  let queue = [];
  await widgets.matchAll( config )
    .then(async widgetList => {
      for (let i = 0; i < widgetList.length; i++) {
        queue.push(updateWidget( widgetList[i] ));
      }
    });
  await Promise.all(queue);
  return;
}

async function updateWidget( widget )
{
  // Widgets with settings should be updated on a per-instance level
  if ( widget.hasSettings )
  {
    let queue = [];
    widget.instances.map( async (instance) => {
      queue.push(updateInstance( instance, widget ));
    });
    await Promise.all(queue);
    return;
  }
  // other widgets can be updated en masse via their tags
  else
  {
    let opts = { headers: {} };
    if ( "type" in widget.definition )
    {
      opts.headers.accept = widget.definition.type;
    }
    await fetch( widget.definition.data, opts )
      .then( response => response.text() )
      .then( data => {
        let payload = {
          template: widget.definition.template,
          data: data
        };
        widgets.updateByTag( widget.definition.tag, payload );
      });
    return;
  }
}

async function updateInstance( instance, widget )
{
  // If we only get an instance id, get the instance itself
  if ( typeof instance === "string" ) {
    let instance_id = instance;
    instance = widget.instances.find( i => i.id === instance );
    if ( instance ) {
      instance = { id: instance_id };
      widget.instances.push( instance );
    }
    console.log(instance, widget);
  }
  if ( !instance.settings ) {
    instance.settings = {};
  }
  let settings_data = new FormData();
  for ( let key in instance.settings ) {
    settings_data.append(key, instance.settings[key]);
  }
  let opts = {};
  if (  settings_data.length > 0 )
  {
    opts = {
      method: "POST",
      body: settings_data,
      headers: {
        contentType: "multipart/form-data"
      }
    };
  }
  if ( "type" in widget.definition )
  {
    opts.headers.accept = widget.definition.type;
  }
  await fetch( widget.definition.data, opts )
    .then( response => response.text() )
    .then( data => {
      let payload = {
        template: widget.definition.template,
        data: data,
        settings: instance.settings
      };
      widgets.updateByInstanceId( instance.id, payload );
    });
  return;
}

async function removeInstance( instance_id, widget )
{
  console.log( `uninstalling ${widget.definition.name} instance ${instance_id}` );
  unregisterPeriodicSync( widget )
    .then(() => {
      widgets.removeByInstanceId( instance_id );
    });
  return;
}

self.addEventListener("widgetclick", function(event) {

  const action = event.action;
  const host_id = event.hostId;
  const widget = event.widget;
  const instance_id = event.instanceId;
    
  switch ( action ) {
    
    // If a widget is being installed
    case "widget-install":
      console.log("installing", widget, instance_id);
      event.waitUntil(
        createInstance( instance_id, widget )
      );
      break;
    
    // If a widget is being uninstalled
    case "widget-uninstall":
      event.waitUntil(
        removeInstance( instance_id, widget )
      );
      break;

    // If a widget host is requesting all its widgets update
    case "widget-resume":
      console.log("resuming all widgets");
      event.waitUntil(
        // refresh the data on each widget
        updateWidgets( host_id )
      );
      break;

    // Custom Actions
    case "refresh":
      console.log("Asking a widget to refresh itself");
      event.waitUntil(
        updateInstance( instance_id, widget )
      );
      break;
  }

});

self.addEventListener("periodicsync", event => {

  const tag = event.tag;
  
  if ( "widgets" in self )
  {
    const widget = widgets.getByTag( tag );
    if ( widget && "update" in widget.definition ) {
      event.waitUntil( updateWidget( widget ) );
    }
  }

});