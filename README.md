# OlaBinder
JS/HTML object to interface binder

## Installation

1. Download file `curl -O https://raw.githubusercontent.com/MiklinMA/OlaBinder/master/olabinder.js`

2. Include into HTML `<script src="olabinder.js"></script>`

## Usage example

```
<head>
  <script src="olabinder.js"></script>
</head>
<body>
  <div>{{$.example.message}}</div>
  <img pp-src="{{$.example.image}}.png" />
  <div pp-repeat="block in $.example.dict">
    <div>{{block.item}}</div>
  </div>
  <div pp-repeat="block in $.example.list">
    <div>{{block}}</div>
  </div>
</body>

<script>
  var root = Binder()
  var ex = root.example = {}
  ex.message = 'test'
  ex.image = 'anything'
  ex.dict = { item: "example dict item" }
  ex.list = [ 1, 2, 3 ]  
</script>
```

## Console example

```
var root = Binder()
root.example = {}
```

Open console and run:

```
root.example.message = 'anything'
```

Interface will be updated


## Class example

Interface will be updated by setter call (after five seconds)

```
class Example {
  constructor() {
    this.message = 'not set'
    setTimeout(() => this.setter(), 5000)
  }
  setter() {
    this.message = 'test'
  }
}
var root = Binder()
root.example = new Example()
```
