const authenticate = (req, res, next)=>{
   //TODO: add jwt authentication logic here
    console.log(' auth middleware is running ', req.body)
    next()
}

module.exports = authenticate