import{a as e,i as t}from"./api.BoK1TlaF.js";t()||(window.location.href=`/login`);var n=document.getElementById(`cuerpo-tabla`),r=document.getElementById(`mensaje`),i=document.getElementById(`info-pagina`),a=document.getElementById(`btn-anterior`),o=document.getElementById(`btn-siguiente`),s=5,c=1,l=1;function u(e){if(!e)return``;let t=new Date(e);return t.toLocaleDateString(`es-CO`)+` `+t.toLocaleTimeString(`es-CO`,{hour:`2-digit`,minute:`2-digit`})}function d(e){return e.replace(` `,`-`)}function f(e,t){l=Math.max(1,Math.ceil(t/s)),n.innerHTML=e.length===0?`<tr><td colspan="6" class="vacio">No tienes solicitudes registradas. <a class="enlace-suave" href="/nueva-solicitud">Crear una</a></td></tr>`:e.map(e=>`
          <tr>
            <td>${e.id}</td>
            <td>${e.asunto}</td>
            <td><span class="etiqueta etiqueta-${d(e.prioridad)}">${e.prioridad}</span></td>
            <td><span class="etiqueta etiqueta-${d(e.estado)}">${e.estado}</span></td>
            <td>${u(e.fecha_creacion)}</td>
            <td><a class="boton" href="/solicitud?id=${e.id}">Ver</a></td>
          </tr>
        `).join(``),i.textContent=`Página ${c} de ${l} (${t} solicitudes)`,a.disabled=c<=1,o.disabled=c>=l}async function p(){try{let t=await(await e(`/api/solicitudes?page=${c}&limit=${s}&sort=fecha_creacion&order=DESC`)).json();if(!t.success){r.textContent=t.message,r.className=`mensaje mensaje-error`;return}f(t.data,t.total)}catch{n.innerHTML=`<tr><td colspan="6" class="vacio">Error al conectar con el servidor</td></tr>`}}a.addEventListener(`click`,()=>{c>1&&(c--,p())}),o.addEventListener(`click`,()=>{c<l&&(c++,p())}),p();