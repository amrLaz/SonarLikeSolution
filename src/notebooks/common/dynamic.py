class Dynamic(dict):
    """Dynamic objects are just bags of properties, some of which may happen to be functions"""

    def __init__(self, **kwargs):
        self.__dict__ = self
        self.update(kwargs)

    def __setattr__(self, name, value):
        import types

        if isinstance(value, types.FunctionType):
            self[name] = types.MethodType(value, self)
        else:
            super(Dynamic, self).__setattr__(name, value)

    def __str__(self):
        return str(self.__dict__)
