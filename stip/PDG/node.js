/****************************************************************
 *   Distributed program dependency graph                        *
 *                                                               *
 *               NODE                                            *
 *                                                               *
 *  - id               (e.g. s1)                                 *
 *  - cnt              (count, e.g. 1)                           *
 *  - incoming edges   [EDGE]                                    *
 *  - outgoing edges   [EDGE]                                    *
 *  - expression       (original expr of an esprima exp. node)   *
 *****************************************************************/

var Aux = require('../aux.js');
var pdg_edge = require('./edge.js');
var EDGES = pdg_edge.EDGES;
var PDG_Edge = pdg_edge.PDG_Edge;

var counter = (function () {
    var cnt = 0;
    return function () {
        return cnt += 1;
    };
})();

var PDG_Node = function (id) {
    this.id = id;
    this.cnt = counter();
    this.edges_in = [];
    this.edges_out = [];
    this.expression = [];
}

PDG_Node.prototype.equals = function (node) {
    return this.id === node.id
}

PDG_Node.prototype.addEdgesIn = function (froms) {
    for (var i = 0; i < froms.length; i++)
        this.edges_in.push(new PDG_Edge(froms[i], this));
}

PDG_Node.prototype.addEdgesOut = function (tos) {
    for (var i = 0; i < tos.length; i++) {
        var totype = tos[i],
            e = new PDG_Edge(this, totype[0], totype[1]);
        this.edges_out.push(e);
        totype[0].edges_in.push(e);
    }
}

PDG_Node.prototype.addEdgeOut = function (to, type, label) {
    var e = new PDG_Edge(this, to, type, label);
    this.edges_out.push(e);
    to.edges_in.push(e);
}

PDG_Node.prototype.removeEdgeOut = function (to, type) {
    this.edges_out = this.edges_out.filter(function (e) {
        if (type)
            return !(e.to.equals(to) && e.equalsType(type));
        else
            return !e.to.equals(to);
    })
}

PDG_Node.prototype.removeEdgeIn = function (from, type) {
    this.edges_in = this.edges_in.filter(function (e) {
        if (type)
            return !(e.from.equals(from) && e.equalsType(type));
        else
            return !e.from.equals(from);
    })
}

PDG_Node.prototype.equals = function (n) {
    return n.id === this.id;
}

PDG_Node.prototype.filterOutNodes = function (f) {
    return this.edges_out.map(function (e) {
        return filter(e.to);
    })
}

PDG_Node.prototype.filterInNodes = function (f) {
    return this.edges_in.map(function (e) {
        return filter(e.from);
    })
}

PDG_Node.prototype.getInEdges = function (type) {
    if (type)
        return this.edges_in.filter(function (e) {
            return e.equalsType(type)
        })
    else
        return this.edges_in
}

PDG_Node.prototype.getOutEdges = function (type) {
    if (type)
        return this.edges_out.filter(function (e) {
            return e.equalsType(type)
        })
    else
        return this.edges_out
}

PDG_Node.prototype.getOutNodes = function (edgeType) {
    return this.getOutEdges(edgeType).map(function (e) {
        return e.to
    })
}

PDG_Node.prototype.getInNodes = function (edgeType) {
    return this.getInEdges(edgeType).map(function (e) {
        return e.from
    })
}

PDG_Node.prototype.toString = function () {
    return this.id;

}

// Aux function
var contains = function (els, el) {
    return els.filter(function (e) {
            return e.equals(el)
        }).length >= 1;
}


PDG_Node.prototype.pathExistsTo = function (to) {
    var out = this.getOutEdges().slice(),
        visited = [],
        found = false;
    while (out.length > 0) {
        var edge = out.shift(),
            target = edge.to;
        if (to.equals(target)) {
            found = true;
            break;
        }
        else {
            var tout = target.edges_out;
            tout.map(function (e) {
                if (!(contains(visited, e))) {
                    visited = visited.concat(e);
                    out = out.concat(e);
                }
            })
        }
    }
    return found;
}

PDG_Node.prototype.enclosingObjectEntry = function () {
    var ins = this.getInEdges(EDGES.CONTROL).slice(),
        visited = [],
        entry;
    if (this._objectEntry)
        return this._objectEntry;
    while (ins.length > 0) {
        var edge = ins.shift(),
            from = edge.from;
        if (from._isObjectEntry) {
            entry = from;
            this._objectEntry = from;
            break;
        }
        else if (from.parsenode && from.parsenode._objectentry) {
            this._objectEntry = from.parsenode._objectentry;
            entry = this._objectEntry;
            break;
        }
        else {
            var ups = from.getInEdges().map(function (edge) {
                if (!(contains(visited, edge))) {
                    visited.push(edge);
                    ins.push(edge);
                }
            })
        }
    }
    return entry;
}

PDG_Node.prototype.enclosingEntry = function () {
    var ins = this.getInEdges(EDGES.CONTROL).slice(),
        visited = [],
        entry;
    while (ins.length > 0) {
        var edge = ins.shift(),
            from = edge.from;
        if (from.isEntryNode) {
            entry = from;
            break;
        } else {
            from.getInEdges(EDGES.CONTROL).map(function (edge) {
                if (!(contains(visited, edge))) {
                    visited.push(edge);
                    ins.push(edge);
                }
            })
        }
    }
    return entry;
}


PDG_Node.prototype.findCallNodes = function () {
    var outs = this.getOutEdges(EDGES.CONTROL),
        calls = [];
    while (outs.length > 0) {
        var edge = outs.shift(),
            to = edge.to;
        if (to.isCallNode && calls.indexOf(to) < 0)
            calls.push(to);
        outs = outs.concat(to.getOutEdges(EDGES.CONTROL))
    }
    return calls;
}

PDG_Node.prototype.dataDependentNodes = function (crossTier, includeActualP) {
    var set = [this],
        data_out = this.edges_out.slice().filter(function (e) {
            if (crossTier)
                return e.equalsType(EDGES.DATA) || e.equalsType(EDGES.REMOTED)
            else
                return e.equalsType(EDGES.DATA)
        })
    while (data_out.length > 0) {
        var e = data_out.shift(),
            to = e.to,
            tout = to.getOutEdges(EDGES.DATA);
        if (to.isActualPNode) {
            if (includeActualP) {
                set.push(to)
            } else {
                var calledges = to.getInEdges(EDGES.CONTROL),
                    callnode = calledges[0].from,
                    isarg = callnode.getInEdges(EDGES.CONTROL).filter(function (e) {
                        return e.from.isActualPNode
                    });
                /* If call node is an argument itself, keep going upwards until
                 the "upper most call node" is found */
                if (isarg.length > 0) {
                    var upcall = callnode;
                    while (isarg.length > 0) {
                        var uparg = isarg.shift().from,
                            upcalledges = uparg.getInEdges(EDGES.CONTROL).filter(function (e) {
                                return e.from.isCallNode
                            }),
                            upcall = upcalledges[0].from;
                        isarg = upcall.getInEdges(EDGES.CONTROL).filter(function (e) {
                            return e.from.isActualPNode
                        });
                    }
                    data_out = data_out.concat(upcall.getOutEdges(EDGES.DATA));
                    var upedges = callnode.getInEdges(EDGES.CONTROL);
                    if (upedges.length > 0)
                        data_out = data_out.concat(upedges)
                    else if (!(contains(set, callnode)))
                        set.push(callnode)
                }
            }
        }
        else if (to.isCallNode) {
            var upnode = to.getInEdges(EDGES.CONTROL)[0].from;
            if (!upnode.isEntryNode && !(contains(set, upnode))) {
                set.push(upnode);
                data_out = data_out.concat(upnode.getOutEdges(EDGES.DATA));
            }
            else if (!(contains(set, to)))
                set.push(to);
        }
        else if (!(contains(set, to)) && !to.isFormalNode) {
            set.push(to);
            data_out = data_out.concat(tout);
        }
    }
    set = set.remove(this);
    function uniq(a) {
        var seen = {};
        return a.filter(function (item) {
            return seen.hasOwnProperty(item) ? false : (seen[item] = true);
        });
    }

    return uniq(set);

}

/* Entry nodes, denoted by "e+index". (Entry) */
var EntryNode = function (id, parsenode) {
    PDG_Node.call(this, 'e' + id);
    this.parsenode = parsenode;
    this.isEntryNode = true;
    this.isCalled = false;
    this.clientCallsNr = 0;
    this.serverCallsNr = 0;
    this.isConstructor = false;
    this.excExits = [];
}

EntryNode.prototype = new PDG_Node();

EntryNode.prototype.getFormalIn = function () {
    var edges = this.edges_out.filter(function (e) {
        return e.to.isFormalNode &&
            e.to.direction === 1
    });
    return edges.map(function (e) {
        return e.to
    })
}

EntryNode.prototype.getFormalOut = function () {
    var form_outs = this.edges_out.filter(function (e) {
        return (e.to.isFormalNode &&
        e.to.direction === -1)
    }).map(function (e) {
        return e.to;
    });
    var exit_outs = this.excExits.flatMap(function (excExit) {
        return excExit.getOutEdges().map(function (e) {
            return e.to;
        }).filter(function (node) {
            return node.isFormalNode;
        })
    })
    return form_outs.concat(exit_outs);
}

EntryNode.prototype.addExcExit = function (node) {
    this.excExits.push(node)
}

EntryNode.prototype.hasBody = function () {
    var edges = this.edges_out.filter(function (e) {
        return e.to.isStatementNode
    });
    return edges.length > 0
}

EntryNode.prototype.getBody = function () {
    var outs = this.getOutEdges(EDGES.CONTROL),
        body = [];
    while (outs.length > 0) {
        var out = outs.shift(),
            target = out.to;
        if (target.isStatementNode ||
            target.isCallNode ||
            target.isObjectEntry ||
            target.isEntryNode) {
            body.push(target);
            outs = outs.concat(target.getOutEdges(EDGES.CONTROL)).concat(target.getOutEdges(EDGES.OBJMEMBER));
            if (target.isStatementNode && Aux.isProperty(target.parsenode))
                outs = outs.concat(target.getOutEdges(EDGES.DATA).filter(function (e) {
                    return e.to.isEntryNode
                }))
        }

    }
    return body;
}

EntryNode.prototype.addCall = function (callnode) {
    this.isCalled = true;
    if (callnode.isServerNode())
        this.serverCallsNr += 1;
    else if (callnode.isClientNode())
        this.clientCallsNr += 1;
}

EntryNode.prototype.serverCalls = function () {
    return this.getInNodes(EDGES.CALL)
        .concat(this.getInNodes(EDGES.REMOTEC))
        .filter(function (call) {
            return call.isServerNode()
        })
        .length;
}

EntryNode.prototype.clientCalls = function () {
    return this.getInNodes(EDGES.CALL)
        .concat(this.getInNodes(EDGES.REMOTEC))
        .filter(function (call) {
            return call.isClientNode()
        })
        .length;
}

EntryNode.prototype.getCalls = function (remote) {
    var edges = this.getInEdges(EDGES.CALL);
    if (remote)
        edges = edges.concat(this.getInEdges(EDGES.REMOTEC));
    return edges.map(function (e) {
        return e.from
    });
}

/* Object Entry nodes, denoted by "OE+index" */
var ObjectEntryNode = function (id, parsenode) {
    EntryNode.call(this, 'o' + id);
    this.parsenode = parsenode;
    this.isObjectEntry = true;
    this.isEntryNode = false;
    this.members = {};
    this.constructorNode;
}

ObjectEntryNode.prototype = new EntryNode();

ObjectEntryNode.prototype.getMember = function (id) {
    var found = this.members[id];
    var chain;
    if (id.name)
        id = id.name
    found = this.members[id];
    if (!found) {
        chain = this.getOutNodes(EDGES.PROTOTYPE)[0];
        if (chain)
            return chain.getMember(id);
    }
    return found;
}


ObjectEntryNode.prototype.addMember = function (name, member) {
    this.addEdgeOut(member, EDGES.OBJMEMBER);
    this.members[name] = member
}


/* Call nodes, denoted by "c+index". (Call) */
var CallNode = function (id, parsenode) {
    PDG_Node.call(this, 'c' + id);
    this.parsenode = parsenode;
    this.isCallNode = true;
}

CallNode.prototype = new PDG_Node();

CallNode.prototype.getActualIn = function () {
    var edges = this.edges_out.filter(function (e) {
        return e.to.isActualPNode &&
            e.to.direction === 1
    })
    return edges.map(function (e) {
        return e.to
    })
}

CallNode.prototype.getActualOut = function () {
    var actual_outs = this.edges_out.filter(function (e) {
        return (e.to.isActualPNode &&
        e.to.direction === -1);
    }).map(function (e) {
        return e.to;
    });
    var exit_outs = this.getOutNodes().filter(function (node) {
        return node.isExitNode;
    }).flatMap(function (node) {
        return node.getOutNodes();
    });

    var catch_out = this.edges_out.map(function (e) {
        return e.to;
    }).filter(function (node) {
        return node.isStatementNode && Aux.isCatchStm(node.parsenode)
    }).flatMap(function (n) {
        return n.getOutNodes().filter(function (n) {
            return n.isActualPNode
        });
    });

    return actual_outs.concat(exit_outs).concat(catch_out);
}

CallNode.prototype.getEntryNode = function () {
    var edges = this.edges_out.filter(function (e) {
        return e.to.isEntryNode &&
            (e.equalsType(EDGES.CALL) ||
            e.equalsType(EDGES.REMOTEC))
    });
    return edges.map(function (e) {
        return e.to;
    });
}

CallNode.prototype.getStmNode = function () {
    var upnodes = this.getInEdges(EDGES.CONTROL).filter(function (e) {
            return e.from.isActualPNode
        }).flatMap(function (e) {
            return e.from.getCall()
        }),
        upnode;
    /* Call is argument itse;f */
    if (upnodes.length > 0) {
        return upnodes.flatMap(function (callnode) {
            return callnode.getStmNode()
        })
    } else {
        upnode = this.getInEdges(EDGES.CONTROL).filter(function (e) {
            return e.from.isStatementNode && !Aux.isTryStm(e.from.parsenode)
        }).map(function (e) {
            return e.from
        })
        if (upnode.length > 0)
            return upnode;
        else
            return [this];

    }
}

/* Statement nodes, denoted by "s+index". (Statement) */
var StatementNode = function (id, parsenode) {
    PDG_Node.call(this, 's' + id);
    this.parsenode = parsenode;
    this.isStatementNode = true;
}

StatementNode.prototype = new PDG_Node();


/* Formal parameters (formal in and formal out)
 * id + direction. 1 = formal in, -1 = formal out */
var FormalPNode = function (id, name, direction) {
    PDG_Node.call(this, 'f' + id + '_' + (direction == 1 ? 'in' : 'out'));
    this.direction = direction;
    this.name = name;
    this.isFormalNode = true;
}

FormalPNode.prototype = new PDG_Node();

// Actual paramaters (actual in and actual out)
// id + direction. 1 = actual in, -1 = actual out
ActualPNode = function (id, direction, parsenode, value) {
    PDG_Node.call(this, 'a' + id + '_' + (direction == 1 ? 'in' : 'out'));
    this.direction = direction;
    this.isActualPNode = true;
    this.parsenode = parsenode;
    this.value = value;
}

ActualPNode.prototype = new PDG_Node();


ActualPNode.prototype.isActualIn = function () {
    return this.direction === 1
}

ActualPNode.prototype.isActualOut = function () {
    return this.direction === -1
}

ActualPNode.prototype.callArgument = function () {
    return this.getOutEdges(EDGES.CONTROL).filter(function (e) {
        return e.to.isCallNode
    }).map(function (e) {
        return e.to
    })
}

ActualPNode.prototype.getCall = function () {
    return this.getInEdges(EDGES.CONTROL).filter(function (e) {
        return e.from.isCallNode
    }).map(function (e) {
        return e.from
    })
}


/* Normal / exception exit nodes */
var ExitNode = function (id, parsenode, exception) {
    PDG_Node.call(this, 'ex' + id);
    this.parsenode = parsenode;
    this.isExitNode = true;
    this.exception = exception
}

ExitNode.prototype = new PDG_Node();

//////////////////////////////////////////
//          Functionality nodes         //
//////////////////////////////////////////
function FunctionalityNode(tag, tier) {
    PDG_Node.call(this, 'C' + tag);
    this.ftype = tag;
    this.tier = tier ? tier : false;
    this.isSliceNode = true;
}

FunctionalityNode.prototype = new PDG_Node();


FunctionalityNode.prototype.getNodes = function (filter) {
    var controls = this.getOutEdges(EDGES.CONTROL);
    var visited = this.getOutNodes(EDGES.CONTROL);
    var filtered = [];
    while (controls.length > 0) {
        var edge = controls.shift();
        var node = edge.to;
        if (filter && filter(node)) {
            filtered.push(node);
        }
        else if (!filter) {
            filtered.push(node);
        }
        visited.push(node);
        node.getOutEdges(EDGES.CONTROL).map(function (e) {
            if (visited.indexOf(e.to) < 0) {
                controls.push(e);
            }
        });
    }
    return filtered;
}

/* Used for counting outbound remote data references and remote calls 
 Only follows control flow edges.
 Default is outbound references, but can be changed with the direction parameter */
FunctionalityNode.prototype.countEdgeType = function (type, direction) {
    var controls = this.getOutEdges(EDGES.CONTROL);
    var visited = this.getOutNodes(EDGES.CONTROL);
    var count = 0;
    while (controls.length > 0) {
        var edge = controls.shift();
        var node = edge.to;
        var edgestype;
        if (direction) {
            edgestype = node.getInEdges(type);
        }
        else {
            edgestype = node.getOutEdges(type);
        }
        visited.push(node);
        count += edgestype.length;
        node.getOutEdges(EDGES.CONTROL).map(function (e) {
            if (visited.indexOf(e.to) < 0) {
                controls.push(e);
            }
        });
    }
    return count;
}

FunctionalityNode.prototype.countEdgeTypeTo = function (edgeType, fType, direction) {
    var controls = this.getOutEdges(EDGES.CONTROL);
    var visited = this.getOutNodes(EDGES.CONTROL);
    var count = 0;
    while (controls.length > 0) {
        var edge = controls.shift();
        var node = edge.to;
        var edgestype;
        if (direction) {
            edgestype = node.getInNodes(edgeType).filter(function (n) {
                return fTypeEquals(fType, n.getFType())
            });
        } else {
            edgestype = node.getOutNodes(edgeType).filter(function (n) {
                return fTypeEquals(fType, n.getFType())
            });
        }
        visited.push(node);
        count += edgestype.length;
        node.getOutEdges(EDGES.CONTROL).map(function (e) {
            if (visited.indexOf(e.to) < 0) {
                controls.push(e);
            }
        });
    }
    return count;
}

FunctionalityNode.prototype.countEdgeTypeFilterFunc = function (edgeType, filter, direction) {
    var controls = this.getOutEdges(EDGES.CONTROL);
    var visited = this.getOutNodes(EDGES.CONTROL);
    var count = 0;
    while (controls.length > 0) {
        var edge = controls.shift();
        var node = edge.to;
        var edgestype;
        if (direction) {
            edgestype = node.getInNodes(edgeType).filter(function (n) {
                return filter(n.getFunctionality())
            });
        } else {
            edgestype = node.getOutNodes(edgeType).filter(function (n) {
                return filter(n.getFunctionality())
            });
        }
        visited.push(node);
        count += edgestype.length;
        node.getOutEdges(EDGES.CONTROL).map(function (e) {
            if (visited.indexOf(e.to) < 0) {
                controls.push(e);
            }
        });
    }
    return count;
}

FunctionalityNode.prototype.countEdgeTypeFilterNode = function (edgeType, filter, direction) {
    var controls = this.getOutEdges(EDGES.CONTROL);
    var visited = this.getOutNodes(EDGES.CONTROL);
    var count = 0;
    while (controls.length > 0) {
        var edge = controls.shift();
        var node = edge.to;
        var edgestype;
        if (direction) {
            edgestype = node.getInNodes(edgeType).filter(function (n) {
                return filter(n)
            });
        } else {
            edgestype = node.getOutNodes(edgeType).filter(function (n) {
                return filter(n)
            });
        }
        visited.push(node);
        count += edgestype.length;
        node.getOutEdges(EDGES.CONTROL).map(function (e) {
            if (visited.indexOf(e.to) < 0) {
                controls.push(e);
            }
        });
    }
    return count;
}

FunctionalityNode.prototype.getFNodes = function (edgeType, direction) {
    var controls = this.getOutEdges(EDGES.CONTROL);
    var visited = this.getOutNodes(EDGES.CONTROL);
    var fnodes = [];
    while (controls.length > 0) {
        var edge = controls.shift();
        var node = edge.to;
        var edgestype;
        if (direction) {
            edgestype = node.getInNodes(edgeType);
        } else {
            edgestype = node.getOutNodes(edgeType);
        }
        visited.push(node);
        edgestype.map(function (node) {
            var fType = node.getFType();
            if (fnodes.indexOf(fType) < 0) {
                fnodes.push(fType);
            }
        })
        node.getOutEdges(EDGES.CONTROL).map(function (e) {
            if (visited.indexOf(e.to) < 0) {
                controls.push(e);
            }
        });
    }
    return fnodes;
}

PDG_Node.prototype.getFunctionality = function () {
    /* Aux function that filters incoming edges */
    var filterIncoming = function (e) {
        // Ignore cycles
        if (e.to.equals(e.from))
            return false;
        // Follow function declarations in form var x  = function () { }
        else if (e.to.parsenode && Aux.isFunExp(e.to.parsenode) &&
            e.from.parsenode && (Aux.isVarDeclarator(e.from.parsenode) ||
            Aux.isVarDecl(e.from.parsenode) || Aux.isProperty(e.from.parsenode) ||
            (Aux.isExpStm(e.from.parsenode) && Aux.isAssignmentExp(e.from.parsenode.expression))))
            return true;
        // Follow var x = new or var x = {} object expressions 
        else if (e.to.parsenode &&
            ( Aux.isObjExp(e.to.parsenode) ||
            Aux.isNewExp(e.to.parsenode) ) &&
            e.from.parsenode &&
            (Aux.isVarDeclarator(e.from.parsenode) ||
            (Aux.isExpStm(e.from.parsenode) && Aux.isAssignmentExp(e.from.parsenode.expression))))
            if (e.from.parsenode.init &&
                e.from.parsenode.init.equals(e.to.parsenode))
                return true;
            else if (e.from.parsenode.expression &&
                e.from.parsenode.expression.right.tag == e.to.parsenode.tag)
                return true;
            else
                return false;

        else if (e.to.parsenode &&
            ( Aux.isObjExp(e.to.parsenode) ||
            Aux.isNewExp(e.to.parsenode) ) &&
            e.from.parsenode &&
            ( Aux.isVarDeclarator(e.from.parsenode) ||
            Aux.isVarDecl(e.from.parsenode) ||
            Aux.isProperty(e.from.parsenode)))
            return true;

        else if (e.to.isObjectEntry && e.from.parsenode
            && Aux.isVarDeclarator(e.from.parsenode) &&
            e.from.parsenode.init === e.to.parsenode)
            return true;
        // Follow edge from argument to its call node
        else if (e.from.isActualPNode && e.to.isCallNode)
            return e.from.direction !== -1
        // Follow edge from call node that is an argument itself
        else if (e.to.isActualPNode && e.from.isCallNode)
            return e.from.direction !== -1
        else
        // Else only follow control type edges + object member edges
            return e.equalsType(EDGES.CONTROL) ||
                e.equalsType(EDGES.OBJMEMBER)
    };


    if (this.isSliceNode) {
        return this;
    }
    else {
        /* recursively traverse up the graph until a node with a 
         * distributed type is encountered, or none is found */
        var incoming = this.edges_in.filter(filterIncoming);
        var visited = [];
        var node;
        while (incoming.length > 0) {
            var edge = incoming.shift();
            node = edge.from;
            visited.push(node);
            if (node.isSliceNode || node.isRootNode)
                break;
            var proceed = node.edges_in.filter(filterIncoming);
            proceed = proceed.filter(function (e) {
                return !visited.find(function (node) {
                    return e.from === node;
                });
            });
            incoming = incoming.concat(proceed);
        }

        if (node)
            if (node.isSliceNode) {
                return node;
            }
            else {
                return false;
            }
        else
            return false;
    }
}


PDG_Node.prototype.getFType = function (recheck) {
    /* Aux function that filter incoming edges */
    var filterIncoming = function (e) {
        // Ignore cycles
        if (e.to.equals(e.from))
            return false;
        // Follow function declarations in form var x  = function () { }
        else if (e.to.parsenode && Aux.isFunExp(e.to.parsenode) &&
            e.from.parsenode && (Aux.isVarDeclarator(e.from.parsenode) ||
            Aux.isVarDecl(e.from.parsenode) || Aux.isProperty(e.from.parsenode) ||
            (Aux.isExpStm(e.from.parsenode) && Aux.isAssignmentExp(e.from.parsenode.expression))))
            return true;
        // Follow var x = new or var x = {} object expressions 
        else if (e.to.parsenode &&
            ( Aux.isObjExp(e.to.parsenode) ||
            Aux.isNewExp(e.to.parsenode) ) &&
            e.from.parsenode &&
            (Aux.isVarDeclarator(e.from.parsenode) ||
            (Aux.isExpStm(e.from.parsenode) && Aux.isAssignmentExp(e.from.parsenode.expression))))
            if (e.from.parsenode.init &&
                e.from.parsenode.init.equals(e.to.parsenode))
                return true;
            else if (e.from.parsenode.expression &&
                e.from.parsenode.expression.right.equals(e.to.parsenode))
                return true;
            else
                return false;

        else if (e.to.parsenode &&
            ( Aux.isObjExp(e.to.parsenode) ||
            Aux.isNewExp(e.to.parsenode) ) &&
            e.from.parsenode &&
            ( Aux.isVarDeclarator(e.from.parsenode) ||
            Aux.isVarDecl(e.from.parsenode) ||
            Aux.isProperty(e.from.parsenode)))
            return true;

        else if (e.to.isObjectEntry && e.from.parsenode
            && Aux.isVarDeclarator(e.from.parsenode) &&
            e.from.parsenode.init === e.to.parsenode)
            return true;
        // Follow edge from argument to its call node
        else if (e.from.isActualPNode && e.to.isCallNode)
            return e.from.direction !== -1
        // Follow edge from call node that is an argument itself
        else if (e.to.isActualPNode && e.from.isCallNode)
            return e.from.direction !== -1
        else
        // Else only follow control type edges + object member edges
            return e.equalsType(EDGES.CONTROL) ||
                e.equalsType(EDGES.OBJMEMBER)
    };

    /* If distributed type is already calculated, return it */
    if (!recheck && this.ftype)
        return this.ftype;
    else if (this.isSliceNode) {
        return this.ftype;
    }
    else {
        /* recursively traverse up the graph until a node with a 
         * distributed type is encountered, or none is found */
        var incoming = this.edges_in.filter(filterIncoming);
        var visited = [];
        var node;
        while (incoming.length > 0) {
            var edge = incoming.shift();
            node = edge.from;
            visited.push(node);
            if (node.ftype || node.isRootNode)
                break;
            var proceed = node.edges_in.filter(filterIncoming);
            proceed = proceed.filter(function (e) {
                return !visited.find(function (node) {
                    return e.from === node
                });
            });
            incoming = incoming.concat(proceed);
        }

        if (node)
            if (node.ftype) {
                this.ftype = node.ftype;
                return node.ftype;
            }
            else {
                return DNODES.SHARED;
            }
        else
            return false;
    }
}

PDG_Node.prototype.equalsFunctionality = function (node) {
    var ftype1 = this.getFType();
    var ftype2 = node.getFType();
    return ftype1 === ftype2 ||
        (this.isSharedNode() && node.isSharedNode());
}

PDG_Node.prototype.equalsTier = function (node) {
    var comp1 = node.getFunctionality();
    var comp2 = this.getFunctionality();
    this.tier = comp2.tier;
    node.tier = comp1.tier;
    return comp1.tier && comp2.tier &&
        comp1.tier === comp2.tier;
}


PDG_Node.prototype.getTier = function () {
    var func = this.getFunctionality();
    this.tier = func.tier;
    return this.tier;
}

//////////////////////////////////////////
//          Distributed nodes           //
//////////////////////////////////////////

var DNODES = {
    CLIENT: "client",
    SERVER: "server",
    SHARED: "shared"
}

var ARITY = {
    ONE: {value: 0, name: "one"},
    ALL: {value: 1, name: "all"}
}

var fTypeEquals = function (type1, type2) {
    return type1 === type2;
}

var arityEquals = function (type1, type2) {
    return type1.value === type2.value
}

var DistributedNode = function (type) {
    FunctionalityNode.call(this, type, type);
    this.isDistributedNode = true;
}

PDG_Node.prototype.isClientNode = function () {
    if (!this.tier)
        this.tier = this.getTier();
    return fTypeEquals(this.tier, DNODES.CLIENT);
}

PDG_Node.prototype.isServerNode = function () {
    if (!this.tier)
        this.tier = this.getTier();
    return fTypeEquals(this.tier, DNODES.SERVER);
}

PDG_Node.prototype.isSharedNode = function () {
    if (!this.tier)
        this.tier = this.getTier();
    if (!this.ftype)
        this.ftype = this.getFType();
    return !this.tier || !this.ftype || fTypeEquals(this.tier, DNODES.SHARED);
}


DistributedNode.prototype = new FunctionalityNode();


var interface = {
    PDG_Node: PDG_Node,
    EntryNode: EntryNode,
    ObjectEntryNode: ObjectEntryNode,
    CallNode: CallNode,
    StatementNode: StatementNode,
    FormalPNode: FormalPNode,
    ActualPNode: ActualPNode,
    ExitNode: ExitNode,
    DNODES: DNODES,
    ARITY: ARITY,
    DistributedNode: DistributedNode,
    FunctionalityNode: FunctionalityNode,
    arityEquals: arityEquals,
    fTypeEquals: fTypeEquals
}

global.Node = interface;
module.exports = interface;